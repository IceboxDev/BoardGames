// The quiz ingest CLI — see README.md beside it for the whole run.
//
//   pnpm quiz-ingest check <work> [card…]             validate printed/*.json
//   pnpm quiz-ingest candidates <work> [bucket…]      write candidates/<domain>__<sub>.md
//   pnpm quiz-ingest apply <work> [--dry-run]         merge every decisions/*.json into the bank
//   pnpm quiz-ingest apply <work> <domain/sub>        validate one bucket's decision on its own
//   pnpm quiz-ingest apply <work> <domain/sub> --part=<stem>   … only decisions/<stem>.json (a shard)
//   pnpm quiz-ingest dedupe <work> <first-lines.tsv>  find re-photographed cards
//   pnpm quiz-ingest rebuild                          rewrite index/meta/timeline after article edits
//   pnpm quiz-ingest check-bank [--complete] [--history] [--chain] [--tags] [--backlog] [--shape]
//                               [--grades] [aNNNN…]
//                                                     every problem of the bank (or of these articles);
//                                                     --history also fails on unlogged changes
//   pnpm quiz-ingest log --reasons=<file.json> [--by=<who>] [--at=YYYY-MM-DD] [--dry-run] [aNNNN…]
//                                                     record every change since the last log in history/
//   pnpm quiz-ingest retire <fNNNNN|wNNNNN> --code=<code> --reason=<…> [--replaced-by=f1,f2]
//   pnpm quiz-ingest restore <fNNNNN|wNNNNN> --reason=<…>
//   pnpm quiz-ingest retire-article <aNNNN> --code=<code> --reason=<…> [--replaced-by=a1,a2]
//   pnpm quiz-ingest restore-article <aNNNN> --reason=<…>
//   pnpm quiz-ingest history <aNNNN|fNNNNN|wNNNNN>     print an entity's changelog
//   pnpm quiz-ingest errata [--source=<id>]            markdown list of every printed card the bank corrects
//   pnpm quiz-ingest evidence show <aNNNN|fNNNNN>      the evidence ledger and the facts' grades
//   pnpm quiz-ingest evidence add --fact=fNNNNN --url= --kind= --lang= --verdict= --confidence= --by= …
//   pnpm quiz-ingest tag add|rm <aNNNN|fNNNNN> <tag…> --reason=<…>
//   pnpm quiz-ingest backlog add --kind= --target= --priority= --notes= [--links=a,b]
//   pnpm quiz-ingest backlog list [--status=] [--kind=] [--target=]
//   pnpm quiz-ingest backlog close <bNNNNN> --by-ref=a0042#17 | --wontfix=<reason>
//   pnpm quiz-ingest regroup --simulate <rules.json> --out=<file.json>
//   pnpm quiz-ingest run open <id> --title= --kind= | run close <id>
//   pnpm quiz-ingest seal [--run=] [--actor=] [--dry-run]
//   pnpm quiz-ingest rewrite-refs --map=<ref-map.json> [--dry-run]
//
// Every command that writes history takes --actor-kind=human|agent|script --actor=<name>
// [--model=<id>] and --run=<id>.
//
// <work> is a source's work folder (e.g. ~/Downloads/quiz-cards/trivial-pursuit)
// holding printed/, candidates/ and decisions/. The bank itself is only ever
// written by `apply`, and only when every card in the run applies cleanly.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { contentProblems } from "../../packages/core/src/quiz/build.ts";
import {
  ArticleSchema,
  allWordings,
  SourceCardsSchema,
} from "../../packages/core/src/quiz/content-types.ts";
import { historyProblems } from "../../packages/core/src/quiz/history.ts";
import {
  applyDecisions,
  articleHash,
  type Bank,
  DecisionSchema,
  type PrintedCard,
  PrintedCardSchema,
  rankCandidates,
} from "../../packages/core/src/quiz/ingest.ts";
import { foldText } from "../../packages/core/src/quiz/search.ts";
import { sourceById } from "../../packages/core/src/quiz/sources.ts";
import { CONTENT_DIR, readBank, writeBank } from "../quiz/lib/content-io.ts";
import { logChanges, parseReasons, readHistories, readHistory } from "../quiz/lib/history-io.ts";
import { actorFromFlags, argValue, byFromFlags, die, runFromFlags, today } from "./args.ts";
import {
  assertLogged,
  backlogCheck,
  backlogCmd,
  chainCheck,
  evidenceCmd,
  gradeReport,
  regroupCmd,
  retireArticleCmd,
  retirementCode,
  rewriteRefsCmd,
  runCmd,
  sealCmd,
  shapeProblems,
  tagCheck,
  tagCmd,
  unloggedCardProblems,
} from "./provenance.ts";

const [command, workArg, ...rest] = process.argv.slice(2);
const flags = new Set([workArg, ...rest].filter((a) => a?.startsWith("--")));
const only = rest.filter((a) => !a.startsWith("--"));

/** --actor / --run from the command line, for every history write. */
function provenance() {
  const actor = actorFromFlags();
  const run = runFromFlags();
  return { by: byFromFlags(actor), ...(actor ? { actor } : {}), ...(run ? { run } : {}) };
}

function readJsonDir<T>(dir: string, parse: (raw: unknown, file: string) => T): Map<string, T> {
  const out = new Map<string, T>();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (err) {
      raw = { unparsable: (err as Error).message };
    }
    out.set(basename(file, ".json"), parse(raw, file));
  }
  return out;
}

function readPrinted(work: string): Map<string, PrintedCard> {
  return readJsonDir(join(work, "printed"), (raw, file) => {
    const r = PrintedCardSchema.safeParse(raw);
    if (!r.success)
      die(
        `printed/${file}: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    return r.data;
  });
}

/** Validate printed cards — all of them, or only the named ones — and list every failure. */
function check(work: string) {
  const dir = join(work, "printed");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  const chosen = files.filter((f) => only.length === 0 || only.includes(basename(f, ".json")));
  let bad = 0;
  for (const file of chosen.sort()) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (err) {
      bad++;
      console.log(`FAIL printed/${file}: ${(err as Error).message}`);
      continue;
    }
    const r = PrintedCardSchema.safeParse(raw);
    if (r.success && r.data.card !== basename(file, ".json")) {
      bad++;
      console.log(`FAIL printed/${file}: card id ${r.data.card} doesn't match the file name`);
    } else if (!r.success) {
      bad++;
      console.log(
        `FAIL printed/${file}: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
  }
  console.log(`[quiz-ingest] ${chosen.length - bad}/${chosen.length} printed cards valid`);
  if (bad > 0) process.exit(1);
}

const bucketFile = (bucket: string) => bucket.replace("/", "__");

/**
 * One candidates file per bucket (the transcribers' suggested domain/sub):
 * the bucket's printed questions, each with the bank's facts it may already
 * be and the articles on nearby topics, plus the bucket's own articles with
 * their baseHash (the only ones its merge may change).
 */
function candidates(work: string) {
  // `--handoff --bank=<staged dir>`: the second round — the first round's
  // handed-off questions, grouped by the bucket they were handed to, against
  // the staged bank (`r2__<stem>.md`).
  const handoffMode = flags.has("--handoff");
  const bankDir = argValue("bank");
  const bank = bankDir ? readBank(resolve(bankDir)) : readBank();
  const printed = readPrinted(work);
  const outDir = join(work, "candidates");
  mkdirSync(outDir, { recursive: true });
  const byBucket = new Map<string, { card: PrintedCard; q: PrintedCard["questions"][number] }[]>();
  const add = (key: string, card: PrintedCard, q: PrintedCard["questions"][number]) => {
    const list = byBucket.get(key) ?? [];
    list.push({ card, q });
    byBucket.set(key, list);
  };
  if (handoffMode) {
    const decisions = readJsonDir(join(work, "decisions"), (raw) => DecisionSchema.parse(raw));
    for (const [stem, d] of decisions) {
      if (stem.startsWith("zz-r2-")) continue;
      for (const h of d.handoff) {
        const card = printed.get(h.card);
        const q = card?.questions.find((x) => x.category === h.category);
        if (!card || !q)
          die(`handoff ${h.card}/${h.category} in ${stem}: no such printed question`);
        add(`${h.domain}/${h.sub}`, card, {
          ...q,
          notes: [q.notes, `handed off by ${d.bucket}: ${h.why}`].filter(Boolean).join(" · "),
        });
      }
    }
  } else {
    for (const card of printed.values())
      for (const q of card.questions) add(`${q.domain}/${q.sub}`, card, q);
  }
  const summary: string[] = [];
  for (const [bucket, items] of [...byBucket].sort()) {
    if (only.length > 0 && !only.includes(bucket)) continue;
    const [domain, sub] = bucket.split("/");
    const ownArticles = bank.articles.filter((a) => a.domain === domain && a.sub === sub);
    const lines = [`# Bucket ${bucket} — ${items.length} printed questions`, ""];
    lines.push(
      `## This bucket's articles (${ownArticles.length}) — id, title, facts/8, baseHash`,
      "",
    );
    for (const a of ownArticles) {
      lines.push(
        `- \`${a.id}\` "${a.titleEn}" — ${a.facts.length}/8, baseHash \`${articleHash(a)}\``,
      );
    }
    lines.push("");
    for (const { card, q } of items) {
      const cat = sourceById(card.source)?.categories[q.category - 1];
      const { facts, articles } = rankCandidates(bank.articles, q);
      lines.push(
        `## { "card": "${card.card}", "category": ${q.category} } · ${cat?.en ?? "?"}`,
        "",
        `> ${q.de} → **${q.answerDe}**`,
        `> ${q.en} → **${q.answerEn}**`,
        ...(q.reworked ? [`> (card: ${q.cardText ?? q.cardDe})`] : []),
        ...(q.notes ? [`> notes: ${q.notes}`] : []),
        "",
        "Facts the bank may already have:",
        "",
      );
      if (facts.length === 0) lines.push("- none");
      for (const f of facts) {
        lines.push(
          `- \`${f.factId}\` in \`${f.articleId}\` "${f.title}" — ${f.question} → ${f.answer} (${f.score}${f.sameAnswer ? ", SAME ANSWER" : ""})`,
        );
      }
      lines.push("", "Articles on nearby topics:", "");
      if (articles.length === 0) lines.push("- none");
      for (const a of articles) {
        lines.push(
          `- \`${a.articleId}\` "${a.title}" — ${a.domain}/${a.sub}, ${a.facts}/8 (${a.score})`,
        );
      }
      lines.push("");
    }
    writeFileSync(
      join(outDir, `${handoffMode ? "r2__" : ""}${bucketFile(bucket)}.md`),
      `${lines.join("\n")}\n`,
    );
    summary.push(`${bucket}\t${items.length}\t${ownArticles.length}`);
  }
  writeFileSync(
    join(work, handoffMode ? "buckets-r2.tsv" : "buckets.tsv"),
    `${summary.join("\n")}\n`,
  );
  console.log(`[quiz-ingest] ${summary.length} buckets → ${outDir} (counts in buckets.tsv)`);
}

/**
 * Apply decisions/*.json. With bucket names: those decisions alone, in
 * memory (`partial` — a worker's validation). Without: every decision
 * against every printed card; `--dry-run` prints the summary only.
 */
function apply(work: string) {
  const dryRun = flags.has("--dry-run");
  const printed = readPrinted(work);
  const partStem = argValue("part");
  // Second round: `zz-r2-*` decisions build on every first-round decision
  // (they sort after them). `--stage=<dir>` writes the first round alone to
  // a separate bank for the second round's workers to read; `--round2=<stem>`
  // validates one second-round file on top of the first round.
  const stageDir = argValue("stage");
  const round2Stem = argValue("round2");
  const isRound2 = (stem: string) => stem.startsWith("zz-r2-");
  const decisions = readJsonDir(join(work, "decisions"), (raw, file) => {
    const r = DecisionSchema.safeParse(raw);
    if (r.success) return r.data;
    const msg = `decisions/${file}: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
    // Another worker's half-written file must not fail this worker's check.
    const own = partStem ?? round2Stem;
    if (own && basename(file, ".json") !== own && (partStem || isRound2(basename(file, ".json"))))
      return null;
    return die(msg);
  });
  const partial = only.length > 0 || stageDir !== undefined || round2Stem !== undefined;
  const chosen = [...decisions.entries()]
    .filter(([, d]) => d !== null)
    .filter(([, d]) => only.length === 0 || only.includes(d?.bucket ?? ""))
    .filter(([stem]) => !partStem || stem === partStem)
    .filter(([stem]) => !stageDir || !isRound2(stem))
    .filter(([stem]) => !round2Stem || !isRound2(stem) || stem === round2Stem)
    .map(([, d]) => d)
    .filter((d) => d !== null);
  if (partial && chosen.length === 0) die(`no decisions for ${only.join(", ")}`);
  const bank: Bank = readBank();
  let res: ReturnType<typeof applyDecisions>;
  try {
    res = applyDecisions(bank, [...printed.values()], chosen, { partial });
  } catch (err) {
    die((err as Error).message);
  }
  const t = res.summary;
  const handoff = chosen.flatMap((d) => d.handoff);
  console.log(
    `[quiz-ingest] ${chosen.length} decisions: ${t.aliases} aliases, ${t.newFacts} new facts, ${t.newArticles} new articles, ${new Set(t.rewritten).size} rewritten, ${t.splits.length} split, ${t.dropped.length} generated facts dropped, ${handoff.length} handed off${partial ? "" : `, ${t.unused.length} unused`}`,
  );
  if (t.rewritten.length > 0) console.log(`  rewritten: ${[...new Set(t.rewritten)].join(" ")}`);
  if (t.splits.length > 0) console.log(`  split: ${t.splits.join(" ")}`);
  if (t.dropped.length > 0) console.log(`  dropped: ${t.dropped.join(" ")}`);
  if (stageDir) {
    // A working copy for second-round workers, not a bank: its printed
    // wordings have no card slots until the final apply, so it skips
    // writeBank's validation and writes the article and source files only.
    const dir = resolve(stageDir);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "articles"), { recursive: true });
    mkdirSync(join(dir, "sources"), { recursive: true });
    for (const a of res.bank.articles)
      writeFileSync(join(dir, "articles", `${a.id}.json`), `${JSON.stringify(a, null, 1)}\n`);
    for (const s of res.bank.sources)
      writeFileSync(join(dir, "sources", `${s.source}.json`), `${JSON.stringify(s, null, 1)}\n`);
    console.log(
      `[quiz-ingest] staged first round in ${stageDir}: ${res.bank.articles.length} articles`,
    );
    return;
  }
  if (partial || dryRun) return;
  const meta = writeBank(res.bank);
  console.log(
    `[quiz-ingest] bank v${meta.version}: ${meta.counts.articles} articles, ${meta.counts.facts} facts`,
  );
  logApply(res.bank, chosen);
}

/**
 * The run's changelog: each new printed wording as printed (with the card it
 * sits on), new facts and articles as created, dropped facts as retired, and
 * every rewritten article as edited by its bucket's merge.
 */
function logApply(bank: Bank, decisions: readonly { bucket: string; source: string }[]) {
  const histories = readHistories();
  const known = new Set<string>();
  for (const h of histories.values()) for (const e of h.entries) known.add(e.target.id);
  const buckets = [...new Set(decisions.map((d) => d.bucket))].join(", ");
  const reasons: Record<
    string,
    { kind: "printed" | "created" | "retired" | "edited"; reason: string; ref?: string }
  > = {};
  // The run's cards: slots attached (or moved) by the merge.
  const runSources = new Set(decisions.map((d) => d.source));
  for (const s of bank.sources) {
    if (!runSources.has(s.source)) continue;
    for (const c of s.cards) {
      reasons[`${s.source}/${c.id}`] = {
        kind: "printed",
        reason: `Card ${c.id} of ${s.source}: its printed questions placed in their slots by the merge (${buckets}).`,
        ref: `quiz-archive/transcripts/${s.source}/${c.id}.json`,
      };
    }
  }
  for (const a of bank.articles) {
    if (!known.has(a.id))
      reasons[a.id] = { kind: "created", reason: `New article written by the merge (${buckets}).` };
    for (const f of [...a.facts, ...(a.retired ?? [])]) {
      if ("retired" in f && f.retired && known.has(f.id)) {
        reasons[f.id] = { kind: "retired", reason: f.retired.reason };
      } else if (!known.has(f.id)) {
        reasons[f.id] = { kind: "created", reason: `New fact written by the merge (${buckets}).` };
      }
      for (const w of f.retiredWordings ?? []) {
        if (known.has(w.id) && !reasons[w.id])
          reasons[w.id] = { kind: "retired", reason: w.retired.reason };
      }
      for (const w of f.wordings) {
        if (known.has(w.id)) continue;
        reasons[w.id] = w.printed
          ? {
              kind: "printed",
              reason: `Printed on ${w.printed.source} card ${w.printed.card}, category ${w.printed.category}${w.cardText ? `; the card's own words are kept in cardText — "${w.cardText}"` : ""}.`,
              ref: `${w.printed.source}/${w.printed.card}`,
            }
          : { kind: "created", reason: `Question written by the merge (${buckets}).` };
      }
    }
  }
  const res = logChanges(bank.articles, {
    reasons: {
      ...reasons,
      default: [{ kind: "edited", reason: `Rewritten by the merge (${buckets}).` }],
    },
    ...provenance(),
    by: argValue("by") ?? `merge ${buckets}`.slice(0, 120),
    at: today(),
    sources: bank.sources,
  });
  console.log(`[quiz-ingest] logged ${res.entries} history entries`);
}

/** Levenshtein similarity in 0..1 over folded text — difflib's ratio is close enough here. */
function similarity(a: string, b: string): number {
  const x = foldText(a);
  const y = foldText(b);
  if (x === y) return 1;
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length, 1);
}

/**
 * Re-photographed cards, before any agent time is spent on them: a TSV of
 * `<photo stem>\t<first question as read>` lines (one cheap crop per photo)
 * is matched against itself and against the bank's printed first questions
 * of that source; pairs at ≥ 0.85 are duplicates.
 */
function dedupe(work: string, tsv: string | undefined) {
  if (!tsv) die("dedupe needs a TSV of `<stem>\\t<first question>` lines");
  const rows = readFileSync(resolve(tsv), "utf8")
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((r) => r.length >= 2 && r[1].trim());
  const bank = readBank();
  const known: [string, string][] = [];
  for (const s of bank.sources) {
    for (const c of s.cards) {
      const w = c.slots[0]?.wordingId;
      const fact = bank.articles
        .flatMap((a) => a.facts)
        .find((f) => f.wordings.some((x) => x.id === w));
      const wording = fact?.wordings.find((x) => x.id === w);
      if (wording) known.push([`${s.source}/${c.id}`, wording.de]);
    }
  }
  const dups: string[] = [];
  rows.forEach(([stem, text], i) => {
    for (const [other, otherText] of [
      ...rows.slice(0, i).map(([s, t]) => [s, t] as [string, string]),
      ...known,
    ]) {
      const r = similarity(text, otherText);
      if (r >= 0.85) {
        dups.push(`${stem}\t${other}\t${r.toFixed(2)}`);
        break;
      }
    }
  });
  writeFileSync(join(work, "duplicates.tsv"), `${dups.join("\n")}\n`);
  console.log(
    `[quiz-ingest] ${dups.length} duplicates of ${rows.length} photos → ${join(work, "duplicates.tsv")}`,
  );
}

/** Rewrite every generated file (and normalise the article files) from the article files. */
function rebuild() {
  const meta = writeBank(readBank());
  console.log(
    `[quiz-ingest] bank v${meta.version}: ${meta.counts.articles} articles, ${meta.counts.facts} facts`,
  );
}

/**
 * The bank's problems — all, or those of the named articles (their facts and
 * wordings included). `--complete` also demands Russian, an image and open
 * questions, as the finished bank must have.
 */
/** The bank, skipping (and listing) unreadable articles that are not in `ids`. */
function readBankSkipping(ids: readonly string[], skipped: string[]): Bank {
  const dir = join(CONTENT_DIR, "articles");
  const articles = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      const id = basename(f, ".json");
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch (err) {
        if (ids.includes(id)) die(`${id}: ${(err as Error).message}`);
        skipped.push(id);
        return [];
      }
      const r = ArticleSchema.safeParse(raw);
      if (r.success) return [r.data];
      if (ids.includes(id))
        die(`${id}: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      skipped.push(id);
      return [];
    });
  const sourceDir = join(CONTENT_DIR, "sources");
  const sources = readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => SourceCardsSchema.parse(JSON.parse(readFileSync(join(sourceDir, f), "utf8"))));
  return { articles, sources };
}

function checkBank(ids: readonly string[]) {
  // Other workers edit other articles meanwhile: one of theirs that is
  // mid-edit and invalid must not fail this worker's check, so with ids an
  // unreadable article outside them is skipped (and named), not fatal.
  const unreadable: string[] = [];
  const bank: Bank = ids.length > 0 ? readBankSkipping(ids, unreadable) : readBank();
  if (unreadable.length > 0)
    console.log(
      `[quiz-ingest] skipped mid-edit articles of other workers: ${unreadable.join(" ")}`,
    );
  const chosen = ids.length > 0 ? bank.articles.filter((a) => ids.includes(a.id)) : bank.articles;
  const missing = ids.filter((id) => !bank.articles.some((a) => a.id === id));
  const own = new Set(
    chosen.flatMap((a) => [
      a.id,
      ...[...a.facts, ...(a.retired ?? [])].flatMap((f) => [
        f.id,
        ...allWordings(f).map((w) => w.id),
      ]),
    ]),
  );
  const histories = flags.has("--history") ? readHistories() : null;
  const mine = (p: string) => ids.length === 0 || [...own].some((id) => p.includes(id));
  const whole = ids.length === 0;
  const problems = [
    ...missing.map((id) => `${id}: no such article`),
    ...contentProblems(bank.articles, bank.sources).filter(mine),
    ...(flags.has("--complete")
      ? contentProblems(chosen, [], { complete: true }).filter(
          (p) => mine(p) && !p.includes("printed but in no card slot"),
        )
      : []),
    ...(histories ? chosen.flatMap((a) => historyProblems(a, histories.get(a.id))) : []),
    ...(flags.has("--chain") ? chainCheck(chosen, bank.sources, whole) : []),
    ...(flags.has("--chain") && whole ? unloggedCardProblems() : []),
    ...(flags.has("--tags") ? tagCheck(chosen) : []),
    ...(flags.has("--backlog") ? backlogCheck(bank).filter(mine) : []),
    ...(flags.has("--shape") ? shapeProblems(bank.articles) : []),
  ];
  if (flags.has("--grades")) gradeReport(chosen);
  for (const p of [...new Set(problems)]) console.log(`PROBLEM ${p}`);
  console.log(
    `[quiz-ingest] ${chosen.length} articles checked, ${new Set(problems).size} problems`,
  );
  if (problems.length > 0) process.exit(1);
}

/** What must be clean before `seal`: no unlogged change anywhere (articles and cards). */
function sealBlockers(): string[] {
  const bank = readBank();
  const histories = readHistories();
  return [
    ...bank.articles.flatMap((a) => historyProblems(a, histories.get(a.id))),
    ...unloggedCardProblems(),
  ];
}

/** Record every change since the last log (see `history-io.ts`). */
function log(ids: readonly string[]) {
  const file = argValue("reasons");
  const reasons = file ? parseReasons(JSON.parse(readFileSync(resolve(file), "utf8"))) : {};
  const bank = readBank();
  const res = logChanges(bank.articles, {
    reasons,
    ...provenance(),
    at: argValue("at") ?? today(),
    ...(ids.length ? { ids } : {}),
    sources: bank.sources,
    dryRun: flags.has("--dry-run"),
  });
  for (const u of res.unexplained) console.log(`UNEXPLAINED ${u}`);
  if (res.unexplained.length > 0) {
    die(`${res.unexplained.length} changed entities have no reason — nothing logged`);
  }
  console.log(
    `[quiz-ingest] ${flags.has("--dry-run") ? "would log" : "logged"} ${res.entries} entries in ${res.articles.length} articles${res.cards.length ? ` and the cards of ${res.cards.join(", ")}` : ""}`,
  );
}

/** Move a wording between its fact's active and retired lists, logging it. */
function retireOrRestoreWording(retire: boolean, wordingId: string, reason: string) {
  const code = retire ? retirementCode() : undefined;
  const bank = readBank();
  const a = bank.articles.find((x) =>
    x.facts.some((f) =>
      (retire ? f.wordings : (f.retiredWordings ?? [])).some((w) => w.id === wordingId),
    ),
  );
  const f = a?.facts.find((x) => allWordings(x).some((w) => w.id === wordingId));
  if (!a || !f) die(`${wordingId} is not ${retire ? "in play" : "retired"} on an active fact`);
  assertLogged(bank, a.id);
  if (retire) {
    const w = f.wordings.find((x) => x.id === wordingId);
    if (!w) die(`${wordingId} not found`);
    if (f.wordings.length === 1) die(`${wordingId} is ${f.id}'s last wording in play`);
    const replacedBy = argValue("replaced-by")?.split(",").filter(Boolean);
    f.wordings = f.wordings.filter((x) => x.id !== wordingId);
    f.retiredWordings = [
      ...(f.retiredWordings ?? []),
      {
        ...w,
        retired: { at: today(), code, reason, ...(replacedBy?.length ? { replacedBy } : {}) },
      },
    ];
  } else {
    const w = f.retiredWordings?.find((x) => x.id === wordingId);
    if (!w) die(`${wordingId} not found`);
    if (w.origin === "generated" && f.wordings.some((x) => x.printed))
      die(`${wordingId} is homebrew and a game prints ${f.id}; it stays retired`);
    const { retired: _gone, ...rest } = w;
    f.retiredWordings = f.retiredWordings?.filter((x) => x.id !== wordingId);
    if (f.retiredWordings?.length === 0) delete f.retiredWordings;
    f.wordings.push(rest);
  }
  writeBank(bank);
  const res = logChanges(bank.articles, {
    reasons: { [wordingId]: { kind: retire ? "retired" : "restored", reason } },
    ...provenance(),
    at: today(),
    ids: [a.id],
  });
  if (res.unexplained.length > 0) {
    die(`logged nothing — other unlogged changes in ${a.id}: ${res.unexplained.join(", ")}`);
  }
  console.log(`[quiz-ingest] ${wordingId} ${retire ? "retired" : "restored"} on ${f.id} (${a.id})`);
}

/** Move a fact between an article's active and retired lists (a wording id: see above), logging it. */
function retireOrRestore(retire: boolean, factId: string | undefined) {
  if (!factId)
    die(`usage: quiz-ingest ${retire ? "retire" : "restore"} <fNNNNN|wNNNNN> --reason=…`);
  const reason = argValue("reason");
  if (!reason) die("--reason=… is required");
  if (factId.startsWith("w")) return retireOrRestoreWording(retire, factId, reason);
  const code = retire ? retirementCode() : undefined;
  const bank = readBank();
  const a = bank.articles.find((x) =>
    (retire ? x.facts : (x.retired ?? [])).some((f) => f.id === factId),
  );
  if (!a) die(`${factId} is not ${retire ? "active" : "retired"} anywhere`);
  assertLogged(bank, a.id);
  if (retire) {
    const f = a.facts.find((x) => x.id === factId);
    if (!f) die(`${factId} not found`);
    if (a.facts.length === 1) die(`${factId} is ${a.id}'s last active fact`);
    const replacedBy = argValue("replaced-by")?.split(",").filter(Boolean);
    a.facts = a.facts.filter((x) => x.id !== factId);
    a.retired = [
      ...(a.retired ?? []),
      {
        ...f,
        retired: { at: today(), code, reason, ...(replacedBy?.length ? { replacedBy } : {}) },
      },
    ];
  } else {
    const f = a.retired?.find((x) => x.id === factId);
    if (!f) die(`${factId} not found`);
    const { retired: _gone, spans, ...rest } = f;
    if (!spans?.en || !spans.de) die(`${factId} has no answer marks; place them before restoring`);
    a.retired = a.retired?.filter((x) => x.id !== factId);
    if (a.retired?.length === 0) delete a.retired;
    a.facts.push({
      ...rest,
      spans: { en: spans.en, de: spans.de, ...(spans.ru ? { ru: spans.ru } : {}) },
    });
  }
  writeBank(bank);
  const res = logChanges(bank.articles, {
    reasons: { [factId]: { kind: retire ? "retired" : "restored", reason } },
    ...provenance(),
    at: today(),
    ids: [a.id],
  });
  if (res.unexplained.length > 0) {
    die(`logged nothing — other unlogged changes in ${a.id}: ${res.unexplained.join(", ")}`);
  }
  console.log(`[quiz-ingest] ${factId} ${retire ? "retired" : "restored"} in ${a.id}`);
}

/** An entity's changelog, oldest first. */
function history(id: string | undefined) {
  if (!id) die("usage: quiz-ingest history <aNNNN|fNNNNN|wNNNNN>");
  const bank = readBank();
  const a = bank.articles.find(
    (x) =>
      x.id === id ||
      [...x.facts, ...(x.retired ?? [])].some(
        (f) => f.id === id || allWordings(f).some((w) => w.id === id),
      ),
  );
  if (!a) die(`${id} not found`);
  const h = readHistory(a.id);
  const entries = (h?.entries ?? []).filter((e) => id === a.id || e.target.id === id);
  for (const e of entries) {
    console.log(
      `${e.at}  ${e.kind.padEnd(11)} ${e.target.id}  ${e.reason}  — ${e.by}${e.actor ? ` (${e.actor.kind}${e.actor.model ? `, ${e.actor.model}` : ""})` : ""}${e.run ? ` {run ${e.run}}` : ""}${e.confidence ? ` <${e.confidence}>` : ""}${e.ref ? ` [${e.ref}]` : ""}${e.movedFrom ? ` (first written ${e.movedFrom.article}#${e.movedFrom.seq})` : ""}`,
    );
    if (e.evidence?.length) console.log(`    evidence: ${e.evidence.join(" ")}`);
    if (e.report) console.log(`    report: ${e.report}`);
    for (const c of e.changes ?? []) {
      if (c.diff) console.log(`    ${c.field}: (text diff, ${c.diff.length} ops)`);
      else
        console.log(
          `    ${c.field}: ${JSON.stringify(c.old ?? null)} → ${JSON.stringify(c.new ?? null)}`,
        );
    }
    for (const s of e.sources ?? []) console.log(`    source: ${s.url}`);
  }
  if (entries.length === 0) console.log(`[quiz-ingest] no history for ${id}`);
}

/** Every printed card question the bank changed: reworded, errata, corrected. */
function errata() {
  const only = argValue("source");
  const bank = readBank();
  const histories = readHistories();
  const lines: string[] = [];
  for (const a of bank.articles) {
    const h = histories.get(a.id);
    for (const f of [...a.facts, ...(a.retired ?? [])]) {
      for (const w of allWordings(f)) {
        if (!w.printed || (only && w.printed.source !== only)) continue;
        const notes = (h?.entries ?? []).filter(
          (e) =>
            (e.target.id === w.id || e.target.id === f.id) &&
            ["reworded", "errata", "corrected", "split", "retired"].includes(e.kind),
        );
        if (!w.cardText && notes.length === 0) continue;
        lines.push(
          `### ${w.printed.source} ${w.printed.card} · category ${w.printed.category} — ${w.id} / ${f.id} (${a.id})`,
        );
        if (w.cardText) lines.push(`- Card: ${w.cardText}`);
        lines.push(`- Now: ${w.de}`, `- Answer: ${f.answerDe} / ${f.answerEn}`);
        for (const e of notes) lines.push(`- ${e.at} ${e.kind}: ${e.reason}`);
        lines.push("");
      }
    }
  }
  console.log(lines.join("\n"));
}

if (command === "log") {
  log([workArg, ...rest].filter((a): a is string => !!a && !a.startsWith("--")));
  process.exit(0);
}
if (command === "retire" || command === "restore") {
  retireOrRestore(command === "retire", workArg);
  process.exit(0);
}
if (command === "history") {
  history(workArg);
  process.exit(0);
}
if (command === "errata") {
  errata();
  process.exit(0);
}
if (command === "rebuild") {
  rebuild();
  process.exit(0);
}
if (command === "check-bank") {
  checkBank([workArg, ...rest].filter((a): a is string => !!a && !a.startsWith("--")));
  process.exit(0);
}
const provenanceCommands: Record<string, () => void> = {
  evidence: evidenceCmd,
  tag: tagCmd,
  backlog: backlogCmd,
  "retire-article": () => retireArticleCmd(true),
  "restore-article": () => retireArticleCmd(false),
  regroup: regroupCmd,
  run: runCmd,
  seal: () => sealCmd(sealBlockers),
  "rewrite-refs": rewriteRefsCmd,
};
if (command && provenanceCommands[command]) {
  provenanceCommands[command]();
  process.exit(0);
}
if (!workArg)
  die(
    `usage: quiz-ingest <check|candidates|apply|dedupe|rebuild|check-bank|log|retire|restore|history|errata|${Object.keys(provenanceCommands).join("|")}> …`,
  );
const work = resolve(workArg);
switch (command) {
  case "check":
    check(work);
    break;
  case "candidates":
    candidates(work);
    break;
  case "apply":
    apply(work);
    break;
  case "dedupe":
    dedupe(work, only[0]);
    break;
  default:
    die(`unknown command ${command}`);
}
