// The provenance commands of the quiz-ingest CLI (README.md beside it):
// evidence, tags, backlog, article retirement, regrouping, runs, the seal,
// the ref rewrite, and the extra check-bank passes.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BACKLOG_KINDS,
  BACKLOG_STATUSES,
  type BacklogKind,
  type BacklogStatus,
  backlogProblems,
  HISTORY_REF_RE,
} from "../../packages/core/src/quiz/backlog-types.ts";
import { activeArticles, domainShape } from "../../packages/core/src/quiz/build.ts";
import {
  type Article,
  RETIREMENT_CODES,
  type RetirementCode,
  type SourceCards,
} from "../../packages/core/src/quiz/content-types.ts";
import {
  CLAIMS,
  type Claim,
  SOURCE_KINDS,
  type SourceKind,
  VERDICTS,
  type Verdict,
} from "../../packages/core/src/quiz/evidence-types.ts";
import { factGrade, GRADES, gradeDistribution } from "../../packages/core/src/quiz/grade.ts";
import {
  CONFIDENCES,
  type Confidence,
  cardHistoryProblems,
  chainProblems,
  lastChain,
} from "../../packages/core/src/quiz/history.ts";
import { tagProblems } from "../../packages/core/src/quiz/tags.ts";
import { DOMAIN_SLUGS } from "../../packages/core/src/quiz/taxonomy.ts";
import {
  closeBacklogItem,
  filterBacklog,
  newBacklogItem,
  readBacklog,
  writeBacklog,
} from "../quiz/lib/backlog-io.ts";
import { type Bank, readBank, readMeta, writeBank, writeMeta } from "../quiz/lib/content-io.ts";
import {
  addEvidence,
  readAllEvidence,
  readEvidence,
  writeEvidence,
} from "../quiz/lib/evidence-io.ts";
import {
  currentHistoryRoot,
  type EntryDraft,
  historyRefExists,
  historySeqs,
  logChanges,
  readCardHistories,
  readHistories,
  rewriteRefs,
  sealHistories,
} from "../quiz/lib/history-io.ts";
import { parseRegroupRules, regroupReasons, simulateRegroup } from "../quiz/lib/regroup.ts";
import { closeRun, openRun, RUN_KINDS } from "../quiz/lib/runs-io.ts";
import { editTags, readTagRegistry } from "../quiz/lib/tags-io.ts";
import {
  actorFromFlags,
  argValue,
  byFromFlags,
  die,
  hasFlag,
  listFlag,
  nowIso,
  positionals,
  runFromFlags,
  today,
} from "./args.ts";

// ── Lookups ──────────────────────────────────────────────────────────────

/** The article holding an article / fact / wording id (retired included). */
export function articleOf(bank: Bank, id: string): Article | undefined {
  return bank.articles.find(
    (a) =>
      a.id === id ||
      [...a.facts, ...(a.retired ?? [])].some(
        (f) =>
          f.id === id || [...f.wordings, ...(f.retiredWordings ?? [])].some((w) => w.id === id),
      ),
  );
}

const oneOf = <T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
) => {
  if (value === undefined) die(`--${name}=<${allowed.join("|")}> is required`);
  if (!(allowed as readonly string[]).includes(value))
    die(`--${name} must be one of ${allowed.join("|")} (got ${value})`);
  return value as T;
};

/**
 * Refuse to edit an article that already has unlogged changes: the command's
 * own reason would otherwise be logged over somebody else's edit.
 */
export function assertLogged(bank: Bank, articleId: string) {
  const res = logChanges(bank.articles, {
    reasons: {},
    by: "check",
    at: today(),
    ids: [articleId],
    dryRun: true,
  });
  if (res.unexplained.length > 0)
    die(`${articleId} has unlogged changes (${res.unexplained.join(", ")}) — log them first`);
}

/** Log the changes of one article, dying (after naming them) on anything unexplained. */
function logOne(
  bank: Bank,
  articleId: string,
  reasons: Parameters<typeof logChanges>[1]["reasons"],
  prepend?: EntryDraft[],
) {
  const actor = actorFromFlags();
  const run = runFromFlags();
  const res = logChanges(bank.articles, {
    reasons,
    by: byFromFlags(actor),
    at: today(),
    ids: [articleId],
    ...(actor ? { actor } : {}),
    ...(run ? { run } : {}),
    ...(prepend ? { prepend: { [articleId]: prepend } } : {}),
  });
  if (res.unexplained.length > 0)
    die(`logged nothing — other unlogged changes in ${articleId}: ${res.unexplained.join(", ")}`);
  return res;
}

// ── evidence ─────────────────────────────────────────────────────────────

export function evidenceCmd() {
  const [sub, id] = positionals();
  if (sub === "show") return evidenceShow(id);
  if (sub === "add") return evidenceAdd();
  die("usage: quiz-ingest evidence show <aNNNN|fNNNNN> | evidence add --fact=fNNNNN …");
}

function evidenceShow(id: string | undefined) {
  if (!id) die("usage: quiz-ingest evidence show <aNNNN|fNNNNN>");
  const bank = readBank();
  const a = articleOf(bank, id);
  if (!a) die(`${id} not found`);
  const ev = readEvidence(a.id);
  const factIds = id === a.id ? [...a.facts, ...(a.retired ?? [])].map((f) => f.id) : [id];
  console.log(`# ${a.id} "${a.titleEn}" — evidence/${a.id}.json${ev ? "" : " (none yet)"}`);
  if (ev) {
    console.log("\n## Sources");
    for (const [sid, s] of Object.entries(ev.sources)) {
      console.log(
        `${sid.padEnd(4)} ${s.kind.padEnd(12)} ${s.lang}  ${s.url}${s.title ? `  "${s.title}"` : ""}${s.cloneOf ? `  (clone of ${s.cloneOf})` : ""}${s.snapshot ? "  [snapshot]" : ""}${s.archiveUrl ? `  [archived]` : ""}`,
      );
    }
    console.log("\n## Assessments");
    for (const as of ev.assessments) {
      if (id !== a.id && as.target !== id) continue;
      console.log(
        `${as.id.padEnd(4)} ${as.at}  ${as.target} ${as.claim}: ${as.verdict} (${as.confidence}) — ${as.by}${as.run ? ` [${as.run}]` : ""}`,
      );
      for (const s of as.support)
        console.log(
          `       ${s.source}: "${s.quote}" (${s.quoteLang}${s.verbatim ? ", verbatim" : ""}${s.verifiedAt ? `, verified ${s.verifiedAt}` : ""})`,
        );
      if (as.note) console.log(`       note: ${as.note}`);
    }
  }
  console.log("\n## Grades");
  for (const fid of factIds) {
    const g = factGrade(fid, ev);
    console.log(
      `${fid}  ${g.grade}  independent ${g.independentSources}, verbatim ${g.verbatim}, primary ${g.primary}${g.contested ? ", CONTESTED" : ""}${g.latestConfidence ? `, latest confidence ${g.latestConfidence}` : ""}`,
    );
  }
}

function evidenceAdd() {
  const target = argValue("fact") ?? argValue("target");
  if (!target) die("--fact=fNNNNN (or --target=aNNNN:body) is required");
  const url = argValue("url");
  if (!url) die("--url= is required");
  const by = argValue("by");
  if (!by) die("--by= is required");
  const lang = argValue("lang");
  if (!lang) die("--lang= is required (ISO 639-1)");
  const bank = readBank();
  const a = articleOf(bank, target.split(":")[0]);
  if (!a) die(`${target} not found`);
  const quote = argValue("quote");
  const verdict = oneOf<Verdict>("verdict", argValue("verdict"), VERDICTS);
  const run = runFromFlags();
  let res: ReturnType<typeof addEvidence>;
  try {
    res = addEvidence(a, readEvidence(a.id), {
      target,
      claim: oneOf<Claim>("claim", argValue("claim") ?? "answer", CLAIMS),
      url,
      ...(argValue("title") ? { title: argValue("title") } : {}),
      ...(argValue("publisher") ? { publisher: argValue("publisher") } : {}),
      kind: oneOf<SourceKind>("kind", argValue("kind"), SOURCE_KINDS),
      lang,
      ...(argValue("archive-url") ? { archiveUrl: argValue("archive-url") } : {}),
      ...(quote ? { quote, quoteLang: argValue("quote-lang") ?? lang } : {}),
      verbatim: hasFlag("verbatim"),
      verdict,
      confidence: oneOf<Confidence>("confidence", argValue("confidence"), CONFIDENCES),
      by,
      ...(run ? { run } : {}),
      ...(argValue("note") ? { note: argValue("note") } : {}),
      at: argValue("at") ?? nowIso(),
    });
  } catch (err) {
    die(`evidence not added: ${(err as Error).message}`);
  }
  writeEvidence(res.ledger);
  if (!quote && verdict !== "unverified")
    console.warn("[quiz-ingest] warning: no --quote, so this source doesn't count towards a grade");
  console.log(
    `[quiz-ingest] ${a.id}/${res.assessmentId} added (${res.newSource ? "new" : "known"} source ${res.sourceId}); ${target.startsWith("f") ? `${target} is now grade ${factGrade(target, res.ledger).grade}` : ""}`,
  );
}

// ── tags ─────────────────────────────────────────────────────────────────

export function tagCmd() {
  const [op, id, ...tags] = positionals();
  if ((op !== "add" && op !== "rm") || !id || tags.length === 0)
    die("usage: quiz-ingest tag add|rm <aNNNN|fNNNNN> <tag…> --reason=…");
  const reason = argValue("reason");
  if (!reason) die("--reason=… is required");
  const registry = readTagRegistry();
  const bank = readBank();
  const a = articleOf(bank, id);
  if (!a) die(`${id} not found`);
  assertLogged(bank, a.id);
  let next: Article;
  try {
    next = editTags(a, id, op, tags, registry);
  } catch (err) {
    die((err as Error).message);
  }
  bank.articles = bank.articles.map((x) => (x.id === a.id ? next : x));
  writeBank(bank);
  logOne(bank, a.id, {
    [id]: { kind: "edited", reason, fields: ["tags"] },
  });
  console.log(`[quiz-ingest] ${id}: ${op === "add" ? "added" : "removed"} ${tags.join(" ")}`);
}

// ── backlog ──────────────────────────────────────────────────────────────

export function backlogCmd() {
  const [sub, id] = positionals();
  if (sub === "add") return backlogAdd();
  if (sub === "list") return backlogList();
  if (sub === "close") return backlogClose(id);
  die("usage: quiz-ingest backlog add|list|close …");
}

function backlogAdd() {
  const target = argValue("target");
  if (!target) die("--target= is required");
  const items = readBacklog();
  const actor = actorFromFlags();
  const run = runFromFlags();
  let item: ReturnType<typeof newBacklogItem>;
  try {
    item = newBacklogItem(items, {
      kind: oneOf<BacklogKind>("kind", argValue("kind"), BACKLOG_KINDS),
      target,
      priority: Number(argValue("priority") ?? Number.NaN),
      notes: argValue("notes") ?? "",
      links: listFlag("links") ?? [],
      by: byFromFlags(actor),
      ...(run ? { run } : {}),
      created: today(),
    });
  } catch (err) {
    die(`backlog item not added: ${(err as Error).message}`);
  }
  const bank = readBank();
  const problems = backlogProblems([item], bank);
  if (problems.length > 0) die(problems.join("; "));
  writeBacklog([...items, item]);
  console.log(`[quiz-ingest] ${item.id} added: ${item.kind} ${item.target} (p${item.priority})`);
}

function backlogList() {
  const status = argValue("status");
  const kind = argValue("kind");
  if (status !== undefined) oneOf<BacklogStatus>("status", status, BACKLOG_STATUSES);
  if (kind !== undefined) oneOf<BacklogKind>("kind", kind, BACKLOG_KINDS);
  const items = filterBacklog(readBacklog(), {
    ...(status ? { status: status as BacklogStatus } : {}),
    ...(kind ? { kind: kind as BacklogKind } : {}),
    ...(argValue("target") ? { target: argValue("target") } : {}),
  });
  for (const b of items) {
    console.log(
      `${b.id}  ${b.status.padEnd(7)} p${b.priority} ${b.kind.padEnd(11)} ${b.target.padEnd(22)} ${b.notes}${b.closedBy ? `  → ${b.closedBy}` : ""}${b.closeReason ? `  (wontfix: ${b.closeReason})` : ""}`,
    );
  }
  console.log(`[quiz-ingest] ${items.length} items`);
}

function backlogClose(id: string | undefined) {
  if (!id) die("usage: quiz-ingest backlog close <bNNNNN> --by-ref=a0042#17 | --wontfix=<reason>");
  const byRef = argValue("by-ref");
  const wontfix = argValue("wontfix");
  if (byRef) {
    if (!HISTORY_REF_RE.test(byRef)) die(`--by-ref must look like a0042#17 or cards/<source>#3`);
    if (!historyRefExists(byRef)) die(`${byRef} is no history entry`);
  }
  const items = readBacklog();
  const i = items.findIndex((b) => b.id === id);
  if (i < 0) die(`${id} not found`);
  try {
    items[i] = closeBacklogItem(items[i], {
      ...(byRef ? { byRef } : {}),
      ...(wontfix ? { wontfix } : {}),
      at: today(),
    });
  } catch (err) {
    die((err as Error).message);
  }
  writeBacklog(items);
  console.log(`[quiz-ingest] ${id} ${items[i].status}`);
}

// ── whole-article retirement ─────────────────────────────────────────────

export function retireArticleCmd(retire: boolean) {
  const [id] = positionals();
  const reason = argValue("reason");
  if (!id || !reason)
    die(
      `usage: quiz-ingest ${retire ? "retire-article <aNNNN> --code=<code> --reason=… [--replaced-by=a1,a2]" : "restore-article <aNNNN> --reason=…"}`,
    );
  const bank = readBank();
  const a = bank.articles.find((x) => x.id === id);
  if (!a) die(`${id} is no article`);
  assertLogged(bank, a.id);
  let event: EntryDraft;
  const actor = actorFromFlags();
  const run = runFromFlags();
  const at = today();
  if (retire) {
    if (a.articleRetired) die(`${id} is already retired`);
    const code = oneOf<RetirementCode>("code", argValue("code"), RETIREMENT_CODES);
    const replacedBy = listFlag("replaced-by");
    a.articleRetired = { at, code, reason, ...(replacedBy?.length ? { replacedBy } : {}) };
    event = {
      at,
      kind: "retired",
      target: { type: "article-retirement", id },
      reason,
      by: byFromFlags(actor),
      changes: [{ field: "articleRetired", new: a.articleRetired }],
      ...(actor ? { actor } : {}),
      ...(run ? { run } : {}),
    };
  } else {
    if (!a.articleRetired) die(`${id} is not retired`);
    const old = a.articleRetired;
    delete a.articleRetired;
    event = {
      at,
      kind: "restored",
      target: { type: "article-retirement", id },
      reason,
      by: byFromFlags(actor),
      changes: [{ field: "articleRetired", old }],
      ...(actor ? { actor } : {}),
      ...(run ? { run } : {}),
    };
  }
  try {
    writeBank(bank);
  } catch (err) {
    die((err as Error).message);
  }
  logOne(
    bank,
    a.id,
    {
      [id]: {
        kind: retire ? "retired" : "restored",
        reason: `${retire ? "Article retired" : "Article restored"}: ${reason}`,
        fields: ["articleRetired"],
      },
    },
    [event],
  );
  console.log(`[quiz-ingest] ${id} ${retire ? "retired" : "restored"}`);
}

/** `--code` for a new fact / wording retirement. */
export function retirementCode(): RetirementCode {
  return oneOf<RetirementCode>("code", argValue("code"), RETIREMENT_CODES);
}

// ── regroup ──────────────────────────────────────────────────────────────

export function regroupCmd() {
  if (!hasFlag("simulate"))
    die("regroup only simulates: quiz-ingest regroup --simulate <rules.json> --out=<file>");
  const [file] = positionals();
  if (!file) die("usage: quiz-ingest regroup --simulate <rules.json> --out=<file.json>");
  const out = argValue("out");
  if (!out) die("--out=<file.json> is required (the proposed moves and reasons)");
  let rules: ReturnType<typeof parseRegroupRules>;
  try {
    rules = parseRegroupRules(JSON.parse(readFileSync(resolve(file), "utf8")));
  } catch (err) {
    die((err as Error).message);
  }
  const bank = readBank();
  const res = simulateRegroup(bank.articles, rules);
  console.log(
    "domain            articles now → proposed   facts now → proposed   by fact count 0…8 (proposed)",
  );
  for (const d of DOMAIN_SLUGS) {
    const b = res.before[d];
    const p = res.after[d];
    console.log(
      `${d.padEnd(17)} ${String(b.articles).padStart(4)} → ${String(p.articles).padEnd(4)} (${fmtDelta(p.articles - b.articles)})   ${String(b.facts).padStart(5)} → ${String(p.facts).padEnd(5)} (${fmtDelta(p.facts - b.facts)})   ${p.byFactCount.join(",")}${shapeOk(p) ? "" : "  ≠ 10/10/30/120/30"}`,
    );
  }
  const perRule = rules.map((_, i) => res.moves.filter((m) => m.rule === i + 1).length);
  console.log(
    `[quiz-ingest] ${res.moves.length} moves (per rule: ${perRule.join(" ")}), ${res.unmatched.length} unmatched (stay), ${res.subGuessed.length} sent to their new domain's first sub`,
  );
  const reasons = regroupReasons(res.moves, rules, file);
  writeFileSync(
    resolve(out),
    `${JSON.stringify({ rules: file, moves: res.moves, unmatched: res.unmatched, subGuessed: res.subGuessed, reasons }, null, 1)}\n`,
  );
  const reasonsFile = resolve(out).replace(/(\.json)?$/, ".reasons.json");
  writeFileSync(reasonsFile, `${JSON.stringify(reasons, null, 1)}\n`);
  console.log(
    `[quiz-ingest] proposal → ${resolve(out)}; reasons for \`log\` → ${reasonsFile} (no article was changed)`,
  );
}

const fmtDelta = (n: number) => (n > 0 ? `+${n}` : String(n));

// ── shape ────────────────────────────────────────────────────────────────

/** The fixed per-domain shape: by fact count 4…8 = 30/120/30/10/10, i.e. 10×8 10×7 30×6 120×5 30×4. */
export const SHAPE = [0, 0, 0, 0, 30, 120, 30, 10, 10] as const;

export function shapeOk(s: { byFactCount: number[] }): boolean {
  return (
    SHAPE.every((n, i) => (s.byFactCount[i] ?? 0) === n) && s.byFactCount.length === SHAPE.length
  );
}

export function shapeProblems(articles: readonly Article[]): string[] {
  const shape = domainShape(articles);
  const problems: string[] = [];
  for (const d of DOMAIN_SLUGS) {
    const s = shape[d];
    const line = `${d}: ${s.articles} articles, ${s.facts} facts, ${[8, 7, 6, 5, 4].map((n) => `${s.byFactCount[n]}×${n}`).join(" ")}`;
    console.log(`SHAPE ${line}`);
    if (!shapeOk(s))
      problems.push(
        `${d}: shape ${s.byFactCount.join(",")} ≠ ${SHAPE.join(",")} (10×8 10×7 30×6 120×5 30×4)`,
      );
  }
  return problems;
}

// ── runs ─────────────────────────────────────────────────────────────────

export function runCmd() {
  const [sub, id] = positionals();
  if (!id || (sub !== "open" && sub !== "close"))
    die("usage: quiz-ingest run open <id> --title=… --kind=… [--by=…] | run close <id>");
  try {
    if (sub === "open") {
      const kind = argValue("kind");
      if (!kind) die(`--kind=<${RUN_KINDS.join("|")}> is required`);
      const by = argValue("by");
      const run = openRun(id, {
        title: argValue("title") ?? "",
        kind,
        by: by ? [by] : [],
        at: nowIso(),
        ...(argValue("brief") ? { brief: argValue("brief") } : {}),
      });
      console.log(`[quiz-ingest] run ${run.id} opened (${run.kind}): ${run.title}`);
    } else {
      let n = 0;
      for (const h of readHistories().values()) n += h.entries.filter((e) => e.run === id).length;
      for (const h of readCardHistories().values())
        n += h.entries.filter((e) => e.run === id).length;
      const run = closeRun(id, { at: nowIso(), historyEntries: n });
      console.log(
        `[quiz-ingest] run ${run.id} closed at ${run.endedAt}; ${n} history entries carry it`,
      );
    }
  } catch (err) {
    die((err as Error).message);
  }
}

// ── seal ─────────────────────────────────────────────────────────────────

export function sealCmd(problemsBeforeSeal: () => string[]) {
  const problems = problemsBeforeSeal();
  if (problems.length > 0) {
    for (const p of problems.slice(0, 40)) console.log(`PROBLEM ${p}`);
    die(`${problems.length} unlogged or broken entries — log them before sealing`);
  }
  const bank = readBank();
  const actor = actorFromFlags({ kind: "script", name: "quiz-ingest seal" }) ?? {
    kind: "script" as const,
    name: "quiz-ingest seal",
  };
  const run = runFromFlags();
  const dryRun = hasFlag("dry-run");
  let res: ReturnType<typeof sealHistories>;
  try {
    res = sealHistories(bank.articles, bank.sources, {
      at: today(),
      actor,
      ...(run ? { run } : {}),
      dryRun,
    });
  } catch (err) {
    die((err as Error).message);
  }
  if (!dryRun) {
    const meta = readMeta();
    if (!meta) die("meta.json is missing or unreadable — run rebuild first");
    writeMeta({ ...meta, historyRoot: res.root });
  }
  console.log(
    `[quiz-ingest] ${dryRun ? "would seal" : "sealed"} ${res.articleEntries} article and ${res.cardEntries} card checkpoints over ${res.files} files; historyRoot ${res.root}`,
  );
}

// ── rewrite-refs ─────────────────────────────────────────────────────────

export function rewriteRefsCmd() {
  const file = argValue("map");
  if (!file) die("usage: quiz-ingest rewrite-refs --map=<ref-map.json> [--dry-run]");
  const raw = JSON.parse(readFileSync(resolve(file), "utf8")) as { map?: Record<string, string> };
  const map = raw.map ?? (raw as Record<string, string>);
  let res: ReturnType<typeof rewriteRefs>;
  try {
    res = rewriteRefs(map, { dryRun: hasFlag("dry-run") });
  } catch (err) {
    die((err as Error).message);
  }
  const unmapped = [...res.unmapped].sort((x, y) => y[1] - x[1]);
  for (const [ref, n] of unmapped.slice(0, 30)) console.log(`UNMAPPED ${ref} (${n})`);
  console.log(
    `[quiz-ingest] ${hasFlag("dry-run") ? "would rewrite" : "rewrote"} ${res.entries} refs in ${res.files} files; ${res.already} already in the archive; ${unmapped.reduce((n, [, c]) => n + c, 0)} unmapped (${unmapped.length} distinct). Nothing staged.`,
  );
}

// ── check-bank passes ────────────────────────────────────────────────────

/** --chain: every history file's chain, every source's card history; strict once sealed. */
export function chainCheck(
  chosen: readonly Article[],
  sources: readonly SourceCards[],
  whole: boolean,
): string[] {
  const histories = readHistories();
  const cards = readCardHistories();
  const meta = readMeta();
  const sealed = !!meta?.historyRoot;
  const problems: string[] = [];
  for (const a of chosen) {
    const h = histories.get(a.id);
    if (!h) continue; // --history reports a missing file
    for (const p of chainProblems(h)) problems.push(`${a.id}: ${p}`);
    if (sealed && lastChain(h.entries) === null)
      problems.push(`${a.id}: history not sealed (no chain)`);
  }
  if (whole) {
    for (const s of sources)
      problems.push(...cardHistoryProblems(s, cards.get(s.source), { strict: sealed }));
    const now = currentHistoryRoot();
    console.log(
      sealed
        ? `[quiz-ingest] history root: sealed ${meta?.historyRoot?.slice(0, 12)}, now ${now.slice(0, 12)}${now === meta?.historyRoot ? " (unchanged since the seal)" : " (entries appended since the seal)"}`
        : "[quiz-ingest] history not sealed yet (no historyRoot in meta.json)",
    );
  }
  return problems;
}

/** --history, whole bank: card changes nobody logged. */
export function unloggedCardProblems(): string[] {
  const res = logChanges([], { reasons: {}, by: "check", at: today(), cards: true, dryRun: true });
  return res.unexplained.map((u) => `${u}: card changed without a history entry`);
}

export function tagCheck(chosen: readonly Article[]): string[] {
  const registry = readTagRegistry();
  return chosen.flatMap((a) => tagProblems(a, registry));
}

export function backlogCheck(bank: Bank): string[] {
  try {
    return backlogProblems(readBacklog(), { ...bank, historySeqs: historySeqs() });
  } catch (err) {
    return [(err as Error).message];
  }
}

/** --grades: the grade distribution of the active facts, per domain (no evidence = E). */
export function gradeReport(articles: readonly Article[]) {
  const evidence = readAllEvidence();
  const per = new Map<string, string[]>();
  for (const a of activeArticles(articles)) {
    const list = per.get(a.domain) ?? [];
    for (const f of a.facts) list.push(factGrade(f.id, evidence.get(a.id)).grade);
    per.set(a.domain, list);
  }
  console.log(`GRADES domain            ${GRADES.map((g) => g.padStart(6)).join("")}  facts`);
  const all: string[] = [];
  for (const d of DOMAIN_SLUGS) {
    const list = per.get(d) ?? [];
    all.push(...list);
    const dist = gradeDistribution(list as (typeof GRADES)[number][]);
    console.log(
      `GRADES ${d.padEnd(17)} ${GRADES.map((g) => String(dist[g]).padStart(6)).join("")}  ${list.length}`,
    );
  }
  const dist = gradeDistribution(all as (typeof GRADES)[number][]);
  console.log(
    `GRADES ${"all".padEnd(17)} ${GRADES.map((g) => String(dist[g]).padStart(6)).join("")}  ${all.length}`,
  );
}
