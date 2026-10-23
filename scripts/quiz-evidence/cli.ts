// The quiz evidence crawler — see README.md beside it.
//
//   pnpm quiz-evidence crawl  [--articles=a0001,a0002] [--limit=N] [--concurrency=4]
//                             [--resume] [--no-wayback] [--dry-run] [--run=<id>]
//   pnpm quiz-evidence verify [--articles=…] [--dry-run] [--run=<id>]
//   pnpm quiz-evidence clones [--articles=…] [--dry-run]
//   pnpm quiz-evidence report [--articles=…]
//   pnpm quiz-evidence backfill [--articles=…] [--dry-run]   (backfill.ts)
//
// Common: --content-dir=<dir> (holds articles/ and evidence/; default the
// bank), --snapshot-dir=<dir> (default packages/quiz-archive/snapshots),
// --state=<file> (default scratch/quiz-evidence/crawl-state.json).

import type { Grade } from "../../packages/core/src/quiz/grade.ts";
import { factGrade, GRADES, gradeDistribution } from "../../packages/core/src/quiz/grade.ts";
import { RunIdSchema } from "../../packages/core/src/quiz/history-schema.ts";
import {
  ANSWER_CHECK,
  appendAssessments,
  CRAWLER,
  detectClones,
  planAssessments,
  QUOTE_CHECK,
} from "./lib.ts";
import { archivePage, defaultSpacer, FetchError, fetchPageText } from "./net.ts";
import {
  Content,
  DEFAULT_CONTENT_DIR,
  DEFAULT_SNAPSHOT_DIR,
  DEFAULT_STATE_FILE,
  readSnapshot,
  StateFile,
  writeSnapshot,
} from "./store.ts";

interface Opts {
  cmd: string;
  articles: Set<string> | null;
  limit: number;
  concurrency: number;
  resume: boolean;
  wayback: boolean;
  dryRun: boolean;
  run: string;
  contentDir: string;
  snapshotDir: string;
  stateFile: string;
}

function parseArgs(argv: string[]): Opts {
  const flags = new Map<string, string>();
  const pos: string[] = [];
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) flags.set(m[1], m[2] ?? "true");
    else pos.push(a);
  }
  const known = new Set([
    "articles",
    "limit",
    "concurrency",
    "resume",
    "no-wayback",
    "dry-run",
    "run",
    "content-dir",
    "snapshot-dir",
    "state",
  ]);
  for (const k of flags.keys()) if (!known.has(k)) throw new Error(`unknown flag --${k}`);
  const run = flags.get("run") ?? `crawl-${new Date().toISOString().slice(0, 10)}`;
  if (!RunIdSchema.safeParse(run).success) throw new Error(`bad --run id ${run}`);
  const list = flags.get("articles");
  return {
    cmd: pos[0] ?? "help",
    articles: list
      ? new Set(
          list
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : null,
    limit: Number(flags.get("limit") ?? Number.POSITIVE_INFINITY),
    concurrency: Math.max(1, Number(flags.get("concurrency") ?? 4)),
    resume: flags.has("resume"),
    wayback: !flags.has("no-wayback"),
    dryRun: flags.has("dry-run"),
    run,
    contentDir: flags.get("content-dir") ?? DEFAULT_CONTENT_DIR,
    snapshotDir: flags.get("snapshot-dir") ?? DEFAULT_SNAPSHOT_DIR,
    stateFile: flags.get("state") ?? DEFAULT_STATE_FILE,
  };
}

const nowIso = () => new Date().toISOString();
const log = (s: string) => process.stdout.write(`${s}\n`);

function ledgerIds(content: Content, opts: Opts): string[] {
  const ids = content.evidenceIds();
  return opts.articles ? ids.filter((id) => opts.articles?.has(id)) : ids;
}

interface Ref {
  article: string;
  sid: string;
}

// ── crawl ────────────────────────────────────────────────────────────────

async function crawl(opts: Opts): Promise<void> {
  const content = new Content(opts.contentDir);
  const state = new StateFile(opts.stateFile);
  const spacer = defaultSpacer();
  const toFetch = new Map<string, Ref[]>();
  const toArchive = new Map<string, Ref[]>();
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of ledgerIds(content, opts)) {
    const ev = content.readEvidence(id);
    if (!ev) continue;
    for (const [sid, s] of Object.entries(ev.sources)) {
      const add = (m: Map<string, Ref[]>) => {
        if (!m.has(s.url)) m.set(s.url, []);
        m.get(s.url)?.push({ article: id, sid });
        if (!seen.has(s.url)) {
          seen.add(s.url);
          order.push(s.url);
        }
      };
      const st = state.state.urls[s.url];
      if (!s.snapshot && !(opts.resume && st?.fetch)) add(toFetch);
      if (opts.wayback && !s.archiveUrl && !(opts.resume && st?.wayback)) add(toArchive);
    }
  }
  const picked = new Set(order.slice(0, opts.limit));
  for (const m of [toFetch, toArchive])
    for (const u of [...m.keys()]) if (!picked.has(u)) m.delete(u);

  log(`crawl: ${toFetch.size} page(s) to fetch, ${toArchive.size} to archive (run ${opts.run})`);
  if (opts.dryRun) {
    for (const u of picked)
      log(
        `  ${toFetch.has(u) ? "fetch" : "     "} ${toArchive.has(u) ? "archive" : "       "} ${u}`,
      );
    return;
  }

  const onSignal = () => {
    state.save();
    log("\ninterrupted — state saved; rerun with --resume to continue");
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const counts = { fetched: 0, failed: 0, archived: 0, archiveFailed: 0 };

  const fetchLane = async () => {
    const queue = [...toFetch.entries()];
    const worker = async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;
        const [url, refs] = item;
        const st = state.get(url);
        const attempts = (st.fetch?.attempts ?? 0) + 1;
        try {
          const page = await fetchPageText(url, spacer);
          const hash = writeSnapshot(opts.snapshotDir, page.text);
          const at = nowIso();
          for (const r of refs) {
            await content.update(r.article, (ev) => {
              const s = ev.sources[r.sid];
              if (!s || s.url !== url || s.snapshot) return null;
              return {
                ...ev,
                sources: { ...ev.sources, [r.sid]: { ...s, retrievedAt: at, snapshot: hash } },
              };
            });
          }
          st.fetch = {
            status: "ok",
            finalUrl: page.finalUrl,
            via: page.via,
            snapshot: hash,
            chars: page.text.length,
            attempts,
            at,
          };
          counts.fetched++;
          log(`  ok    ${url} → ${hash.slice(0, 12)} (${page.text.length} chars, ${page.via})`);
        } catch (err) {
          const reason = err instanceof FetchError ? err.reason : "error";
          st.fetch = {
            status: "failed",
            reason,
            ...(err instanceof FetchError && err.httpStatus ? { httpStatus: err.httpStatus } : {}),
            attempts,
            at: nowIso(),
          };
          counts.failed++;
          log(`  FAIL  ${url} (${reason}${err instanceof FetchError ? "" : `: ${String(err)}`})`);
        }
        state.save();
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency }, worker));
  };

  const waybackLane = async () => {
    for (const [url, refs] of toArchive) {
      const st = state.get(url);
      const attempts = (st.wayback?.attempts ?? 0) + 1;
      try {
        const got = await archivePage(url, spacer);
        for (const r of refs) {
          await content.update(r.article, (ev) => {
            const s = ev.sources[r.sid];
            if (!s || s.url !== url || s.archiveUrl) return null;
            return {
              ...ev,
              sources: { ...ev.sources, [r.sid]: { ...s, archiveUrl: got.archiveUrl } },
            };
          });
        }
        st.wayback = {
          status: "ok",
          archiveUrl: got.archiveUrl,
          via: got.via,
          attempts,
          at: nowIso(),
        };
        counts.archived++;
        log(`  wayback ${got.via.padEnd(7)} ${url} → ${got.archiveUrl}`);
      } catch (err) {
        const reason = err instanceof FetchError ? err.reason : "error";
        st.wayback = { status: "failed", reason, attempts, at: nowIso() };
        counts.archiveFailed++;
        log(`  wayback FAIL ${url} (${reason})`);
      }
      state.save();
    }
  };

  await Promise.all([fetchLane(), waybackLane()]);
  state.save();
  log(
    `crawl done: ${counts.fetched} fetched, ${counts.failed} failed, ${counts.archived} archived, ${counts.archiveFailed} archive failures`,
  );
}

// ── verify / clones ──────────────────────────────────────────────────────

function loadTexts(content: Content, opts: Opts, id: string) {
  const ev = content.readEvidence(id);
  const texts = new Map<string, string>();
  let missing = 0;
  if (!ev) return { ev, texts, missing };
  for (const [sid, s] of Object.entries(ev.sources)) {
    if (!s.snapshot) continue;
    const t = readSnapshot(opts.snapshotDir, s.snapshot);
    if (t === null) missing++;
    else texts.set(sid, t);
  }
  return { ev, texts, missing };
}

async function markClones(content: Content, opts: Opts, id: string): Promise<number> {
  const { ev, texts } = loadTexts(content, opts, id);
  if (!ev) return 0;
  const marks = detectClones(ev.sources, texts);
  const n = Object.keys(marks).length;
  for (const [sid, of] of Object.entries(marks))
    log(`  clone ${id}/${sid} (${ev.sources[sid].url}) → ${of}`);
  if (n === 0 || opts.dryRun) return n;
  await content.update(id, (cur) => {
    const sources = { ...cur.sources };
    let changed = false;
    for (const [sid, of] of Object.entries(marks)) {
      if (!sources[sid] || sources[sid].cloneOf) continue;
      sources[sid] = { ...sources[sid], cloneOf: of };
      changed = true;
    }
    return changed ? { ...cur, sources } : null;
  });
  return n;
}

async function clones(opts: Opts): Promise<void> {
  const content = new Content(opts.contentDir);
  let n = 0;
  for (const id of ledgerIds(content, opts)) n += await markClones(content, opts, id);
  log(`clones: ${n} source(s) marked${opts.dryRun ? " (dry run)" : ""}`);
}

async function verify(opts: Opts): Promise<void> {
  const content = new Content(opts.contentDir);
  const tally = { clones: 0, confirmed: 0, unverified: 0, quotes: 0, missingSnapshots: 0 };
  for (const id of ledgerIds(content, opts)) {
    tally.clones += await markClones(content, opts, id);
    const article = content.article(id);
    if (!article) {
      log(`  skip ${id}: no article`);
      continue;
    }
    const { ev, texts, missing } = loadTexts(content, opts, id);
    tally.missingSnapshots += missing;
    if (!ev || texts.size === 0) continue;
    const now = nowIso();
    const drafts = planAssessments(ev, article.facts, texts, { now, run: opts.run });
    for (const d of drafts) {
      if (d.note?.startsWith(QUOTE_CHECK)) tally.quotes++;
      else if (d.verdict === "confirmed") tally.confirmed++;
      else tally.unverified++;
      log(
        `  ${id} ${d.target} ${d.verdict.padEnd(10)} ${d.support[0]?.source}: ${d.support[0]?.quote.slice(0, 110)}`,
      );
    }
    if (drafts.length === 0 || opts.dryRun) continue;
    // Re-plan on the file as it stands inside the lock (same result unless it changed).
    await content.update(id, (cur) => {
      const again = planAssessments(cur, article.facts, texts, { now, run: opts.run });
      return again.length ? appendAssessments(cur, again, now) : null;
    });
  }
  log(
    `verify${opts.dryRun ? " (dry run)" : ""}: ${tally.confirmed} confirmed, ${tally.unverified} unverified, ${tally.quotes} agent quote(s) verified, ${tally.clones} clone(s) marked, ${tally.missingSnapshots} snapshot(s) missing locally`,
  );
}

// ── report ───────────────────────────────────────────────────────────────

function countBy<T>(items: Iterable<T>, key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

const fmt = (r: Record<string, number>) =>
  Object.entries(r)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "—";

function report(opts: Opts): void {
  const content = new Content(opts.contentDir);
  const state = new StateFile(opts.stateFile);
  const urls = Object.values(state.state.urls);
  const fetchFailed = urls.filter((u) => u.fetch?.status === "failed");
  const wbOk = urls.filter((u) => u.wayback?.status === "ok");
  const wbFailed = urls.filter((u) => u.wayback?.status === "failed");
  log(`state ${opts.stateFile}`);
  log(`  fetched ok: ${urls.filter((u) => u.fetch?.status === "ok").length}`);
  log(
    `  fetch failed: ${fetchFailed.length} (${fmt(countBy(fetchFailed, (u) => u.fetch?.reason ?? "?"))})`,
  );
  log(`  wayback ok: ${wbOk.length} (${fmt(countBy(wbOk, (u) => u.wayback?.via ?? "?"))})`);
  log(
    `  wayback failed: ${wbFailed.length} (${fmt(countBy(wbFailed, (u) => u.wayback?.reason ?? "?"))})`,
  );

  const src = { total: 0, snapshot: 0, archive: 0, clone: 0 };
  const checks = { confirmed: 0, unverified: 0, quotes: 0 };
  const grades: Grade[] = [];
  const ledgers = new Set(content.evidenceIds());
  const articleIds = content.articleIds().filter((id) => !opts.articles || opts.articles.has(id));
  for (const id of articleIds) {
    const ev = ledgers.has(id) ? content.readEvidence(id) : null;
    const article = content.article(id);
    if (ev) {
      for (const s of Object.values(ev.sources)) {
        src.total++;
        if (s.snapshot) src.snapshot++;
        if (s.archiveUrl) src.archive++;
        if (s.cloneOf) src.clone++;
      }
      const lastCheck = new Map<string, string>();
      for (const a of ev.assessments) {
        if (a.by !== CRAWLER) continue;
        if (a.note?.startsWith(QUOTE_CHECK)) checks.quotes++;
        if (a.note?.startsWith(ANSWER_CHECK))
          lastCheck.set(`${a.target}/${a.support[0]?.source}`, a.verdict);
      }
      for (const v of lastCheck.values()) {
        if (v === "confirmed") checks.confirmed++;
        else checks.unverified++;
      }
    }
    for (const f of article?.facts ?? []) grades.push(factGrade(f.id, ev ?? undefined).grade);
  }
  log(
    `ledgers: ${articleIds.filter((id) => ledgers.has(id)).length} of ${articleIds.length} article(s)`,
  );
  log(
    `  sources: ${src.total} (snapshot ${src.snapshot}, archived ${src.archive}, clones ${src.clone})`,
  );
  log(
    `  crawler answer checks (latest per fact × source): confirmed ${checks.confirmed}, unverified ${checks.unverified}; agent quotes verified ${checks.quotes}`,
  );
  const dist = gradeDistribution(grades);
  log(
    `grades (${grades.length} active facts): ${GRADES.map((g) => `${g} ${dist[g]}`).join(" · ")}`,
  );
}

// ── main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (process.argv[2] === "backfill") {
    const { main: backfill } = await import("./backfill.ts");
    return backfill(process.argv.slice(3));
  }
  const opts = parseArgs(process.argv.slice(2));
  switch (opts.cmd) {
    case "crawl":
      return crawl(opts);
    case "verify":
      return verify(opts);
    case "clones":
      return clones(opts);
    case "report":
      return report(opts);
    default:
      log(
        "usage: pnpm quiz-evidence backfill|crawl|verify|clones|report [flags] — see scripts/quiz-evidence/README.md",
      );
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
