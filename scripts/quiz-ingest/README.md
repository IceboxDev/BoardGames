# Quiz ingest — a new game's cards into the quiz bank

The quiz bank (`packages/core/src/quiz/content/`) is one topic-organised knowledge base shared by
every quiz game. A new game's printed cards are merged into it, never stored beside it: a question
the bank already knows becomes another wording of that fact, a new fact joins the article on its
topic, a new topic gets a new article. Model and invariants: `packages/core/src/quiz/content-types.ts`;
merge logic: `packages/core/src/quiz/ingest.ts`.

A run uses Claude worker agents, one card per agent, as the first Quiztopia batch did: at most 20
at a time, one started per one finished, Sonnet as the fallback when Opus's output filter refuses
a card, and a reused scratch folder when a session limit cuts a worker off.

## 0. Prepare

- The source is listed in `packages/core/src/quiz/sources.ts` (id, the game's own categories in
  card order, `questionsPerCard`, where the answers are, the photo layout). Check the category
  names against the scanned box before the first run.
- Work folder per source, on the machine with the photos: `~/Downloads/quiz-cards/<source>/`
  holding `photos/`, `printed/`, `candidates/`, `decisions/`, `scratch/`.
- Card ids: `<prefix>-NNNN` in photo order (e.g. `tp-0001`), fixed once given.

## 1. Dedupe the photos first

Before any agent time: crop the region that differs between cards (the first question), read the
crops in labelled montages, write `<stem>\t<first question>` lines to a TSV, then
`pnpm quiz-ingest dedupe <work> <tsv>` — pairs at ≥ 0.85 similarity (against each other and against
cards already in the bank) go to `<work>/duplicates.tsv`; skip them.

## 2. Transcribe — one agent per card

Prompt each worker with `WORK`, `SOURCE`, `CARD`, the photo path(s) and "follow
scripts/quiz-ingest/TRANSCRIBE.md". Output `printed/<card>.json`; `pnpm quiz-ingest check <work>`
validates them all.

## 3. Candidates

`pnpm quiz-ingest candidates <work>` writes `candidates/<card>.md`: for every printed question the
bank's facts it may already be (answer match + word overlap) and the articles on nearby topics,
each with its `baseHash`.

## 4. Merge decisions — one agent per card

Prompt each worker with `WORK`, `CARD` and "follow scripts/quiz-ingest/MERGE.md". Each writes
`decisions/<card>.json` and validates it with `apply --dry-run`. Parallel workers decide against the
same bank, so two of them may touch one article: `apply` refuses a decision whose article changed
since its `baseHash` — regenerate that card's candidates and rerun its merge after the others are in.

## 5. Apply and review

`pnpm quiz-ingest apply <work> --dry-run` applies every decision in memory and prints the summary
(aliases, new facts, new articles, rewritten articles, splits, dropped generated facts).
Without `--dry-run` it writes the bank (index, meta and timeline are regenerated; nothing is written
unless every card applies). Then `pnpm --filter @boardgames/core test src/quiz` and review the
`git diff` of `packages/core/src/quiz/content/` before committing.

Members keep their progress through all of this: it hangs off fact ids, which an alias, a rewrite
or a split never changes. A dropped generated fact is retired (kept in the article's `retired`
list), never deleted; its schedule rows simply stop being shown.

## 6. The changelog (every change, with its reason)

Every article, fact and wording has a history in `content/history/aNNNN.json` (`core/quiz/history.ts`):
what changed (field by field; long texts as word diffs), when, why, by whom and on what evidence —
from the printed card's own words through rewordings, errata, corrections, translations, splits and
retirements. Tracking is enforced: the integrity test and `check-bank --history` fail on any entity
whose content differs from its last history entry, and on history whose entity is gone (nothing is
ever deleted — retire instead).

- `apply` logs its own changes (printed / created / edited / retired).
- Any other edit: make it, then `pnpm quiz-ingest log --reasons=<file.json> [--by=<who>]`. The
  reasons file maps each changed entity id to `{kind, reason, sources?, ref?, fields?}` (or a list
  split by `fields`); `log` refuses (writes nothing) while any changed entity has no reason. It
  diffs against the git index (the last logged state) and stages what it logged — nothing is
  committed. Workers write the reasons file; the coordinator runs `log` (one at a time).
- `retire <fNNNNN|wNNNNN> --code=<code> --reason=… [--replaced-by=…]` / `restore <fNNNNN|wNNNNN>
  --reason=…` move a fact (or wording) in or out of play and log it (§ 7.6 for the codes). `history <id>` prints an entity's changelog; `errata [--source=…]` lists
  every printed card question the bank corrects or reworded.

## 7. Provenance: actors, runs, evidence, tags, backlog, the seal

Everything below writes through the same changelog. Check commands never write; every other one
validates its result first and writes nothing when it fails.

### 7.1 Actors and runs (on every command that writes history)

| flag | stored as |
|---|---|
| `--by=<name>` | `by` (free text, as before; defaults to `--actor`, else `coordinator`) |
| `--actor-kind=human\|agent\|script --actor=<name> [--model=<id>]` | `actor: {kind, name, model?}` |
| `--run=<id>` | `run` — the batch, `packages/quiz-archive/runs/<id>/` |

`log`, `retire`, `restore`, `retire-article`, `restore-article`, `tag`, `apply` and `seal` take
them. `--actor-kind` defaults to `human`; a run without a `run.json` yet only warns.

- `run open <id> --title=… --kind=<kind> [--by=…] [--brief=…]` writes the skeleton
  `runs/<id>/run.json` (RUNS.md's shape; `endedAt` null). Kinds: ingest, enrich, research,
  rebalance, rework, dedupe, split, import, tagging, evidence, backlog, retire, seal, other. Ids:
  `a-z0-9.-`, e.g. `tags-2026-10-24`.
- `run close <id>` stamps `endedAt` and `counts.historyEntries` (the entries carrying the run).
  Copy the run's briefs, reasons and reports into the folder as RUNS.md describes.

### 7.2 The reasons file

`log --reasons=<file.json>` maps each changed entity to a reason, or a list split by `fields`:

```json
{
  "f01234": { "kind": "corrected", "reason": "…", "fields": ["answerEn", "answerDe"],
              "sources": [{ "url": "https://…", "title": "…" }],
              "ref": "quiz-archive/runs/<run>/<file>",
              "confidence": "high", "evidence": ["e3", "a0042/e7"], "report": "<quiz_reports id>",
              "run": "<run id, when not the log's --run>" },
  "trivial-pursuit/tp-221": { "kind": "printed", "reason": "…" },
  "default": { "kind": "edited", "reason": "…" }
}
```

- `kind` is one of `HISTORY_KINDS` (core `history-schema.ts`); `reason` is plain English for a
  reader who wasn't there.
- `confidence` is high|medium|low; `evidence` names assessments of the evidence ledger (§ 7.4).
- New `ref`s point into the archive: `quiz-archive/runs/<run>/<file>` or
  `quiz-archive/transcripts/<source>/<card>.json`.
- Cards are keyed `<source>/<card>` (a bare card id works too) and never take `default`.

### 7.3 The chain, moves and card history

- **Chain.** Every entry written from now on carries `chain` = sha256(previous link + the entry),
  so each history file is a tamper-evident hash chain from its first chained entry on. The
  unchained backfill before it stays valid; an unchained entry after it is a problem. `log`
  refuses to write to a file whose chain is already broken. `ref` is covered by the chain (not by
  `hash`), so refs of chained entries never change.
- **Moves.** When a fact moves, its earlier entries move with it, keep where they were first
  written (`movedFrom: {article, seq}`) and are re-linked in their new file; the file they left
  is re-linked from its first chained entry.
- **Cards.** `history/cards/<source>.json` (target type `card`, keyed by card id) tracks each
  printed card's photo and slots. `log` (without article ids) diffs `sources/*.json` against the
  git index like the articles, and needs a reason for every changed card. A card is checked
  against its last hashed entry once it has one; a source file the index never held is tracked
  from the seal on (or when a reason names the card). `apply` names its source's cards itself.

### 7.4 Evidence and grades

`content/evidence/aNNNN.json` is the article's evidence ledger, append-only (core
`evidence-types.ts`); a fact's research grade A–E is computed from it (`grade.ts`), never set.

- `evidence show <aNNNN|fNNNNN>` prints the sources, the assessments and each fact's grade with
  its counts (independent sources, verbatim, primary, contested, latest confidence).
- `evidence add --fact=fNNNNN (or --target=aNNNN:body) --url=… --kind=<source kind> --lang=xx
  --verdict=confirmed|contested|refuted|unverified --confidence=high|medium|low --by=<who>
  [--claim=answer|premise|body-number|card-says] [--title=… --publisher=… --archive-url=…]
  [--quote=… --quote-lang=xx --verbatim] [--note=…] [--run=…] [--at=…]` appends one
  assessment (`e1`, `e2` … counting up). The source is reused when the ledger already cites that
  URL, else added as the next `sN` with `retrievedAt` now. Source kinds: primary, official,
  scholarly, reference, encyclopedia, press, book, fan, other. Without `--quote` the assessment
  cites nothing, so it doesn't count towards the grade. A verbatim quote counts as verified only
  once the crawler has a snapshot or a `verifiedAt` (`scripts/quiz-evidence/`).
- `check-bank --grades` prints the grade distribution of the active facts per domain; a fact
  without evidence is E.

### 7.5 Tags

The registry is `content/tags.json` (core `tags.ts`): facets, their labels and allowed values.
Derived facets (`era`, `source`, `printed`) are computed into the index and never stored.

- `tag add|rm <aNNNN|fNNNNN> <tag…> --reason=…` edits the article's (or a fact's) stored `tags`,
  rejects anything the registry doesn't accept, rebuilds the bank and logs an `edited` entry
  (fields `tags`). It refuses an article with unlogged changes.
- `check-bank --tags` checks every stored tag against the registry.
- `regroup --simulate <rules.json> --out=<proposal.json>` proposes a domain/sub layout from tag
  queries and never edits an article. Rules are tried in order:

  ```json
  { "rules": [
    { "domain": "music-stage", "sub": "classical", "query": { "all": ["topic:music/classical"] } },
    { "domain": "history", "query": { "any": ["era:m2/c19", "topic:history"], "none": ["topic:art"] } }
  ] }
  ```

  Each active article goes to the first rule whose query its tags (stored + derived) answer;
  `topic:music` matches `topic:music/opera`. A rule without `sub` keeps the article's sub when
  the domain has it, else the domain's first sub (listed as `subGuessed`). Unmatched articles
  stay. It prints per-domain articles and facts now → proposed and the proposed shape, and writes
  `{moves, unmatched, subGuessed, reasons}` to `--out` plus `<out>.reasons.json` ready for
  `log --reasons` once the moves are made.

### 7.6 Retirement codes, retired articles

Every new retirement takes `--code=`: duplicate, off-topic, giveaway, non-trivia, outdated,
wrong, superseded-by-print, quota-trim, distasteful, merged, split, other. `reason` stays free
text.

- `retire-article <aNNNN> --code=… --reason=… [--replaced-by=a1,a2]` sets the article's
  `articleRetired`: it leaves the index, the timeline, the quotas and the trainer, while its file
  and history stay. It logs an `article-retirement` entry (the event) and the article's own
  `retired` entry (its hash).
- `restore-article <aNNNN> --reason=…` puts it back the same way (`restored`).

### 7.7 Backlog

`content/backlog.jsonl` is one item per line (core `backlog-types.ts`).

- `backlog add --kind=<verify|research|photo-check|stale|report|rework|idea|candidate>
  --target=<aNNNN[:body]|fNNNNN|wNNNNN|<source>/<card>|domain:<slug>|report:<id>>
  --priority=1..4 --notes=… [--links=a,b] [--by=…] [--run=…]` adds an open item with the next
  id (`b00001` …), validated against the bank.
- `backlog list [--status=…] [--kind=…] [--target=…]`.
- `backlog close <bNNNNN> --by-ref=a0042#17 | --wontfix=<reason>`: done needs the history entry
  that did the work (`aNNNN#seq` or `cards/<source>#seq`, checked to exist); won't-fix needs a
  reason.
- `check-bank --backlog` checks every item (targets exist, closers exist).

### 7.8 check-bank flags

| flag | checks |
|---|---|
| `--complete` | Russian, images, open questions (as before) |
| `--history` | every article entity matches its last entry; nothing deleted (as before) |
| `--chain` | every chain link; card histories; unlogged card changes; once sealed, every file chained and every card logged; prints the history root against the sealed one |
| `--tags` | stored tags against the registry |
| `--backlog` | the backlog's items |
| `--shape` | every domain exactly 10×8 / 10×7 / 30×6 / 120×5 / 30×4 facts per article (200 articles, 1,050 facts); prints each domain's shape and fails otherwise |
| `--grades` | prints the grade distribution per domain (never fails) |

### 7.9 Seal

`seal [--run=…] [--actor-kind=… --actor=…] [--dry-run]` appends one chained `checkpoint` per
entity of every article and per card of every source, then writes the Merkle root over every
history file's head into `meta.json` (`historyRoot`; rebuilds keep it). It refuses while any
change is unlogged (articles or cards) or any chain is broken. It stages nothing. Seal once,
after the data waves, then run `check-bank --chain`.

### 7.10 One-off: rewrite-refs

`rewrite-refs --map=packages/quiz-archive/runs/ref-map.json [--dry-run]` points every history
`ref` into the archive (`old` → `quiz-archive/<mapped>`, each path of a multi-file ref prefixed).
Refs already under `quiz-archive/` are skipped, and it refuses to touch a chained entry. It
stages nothing. It was run once on 2026-10-23: 75,967 refs in 2,793 files, 0 unmapped.

### 7.11 Tests

`pnpm --filter @boardgames/core exec vitest run --config ../../scripts/quiz-ingest/vitest.config.ts`
runs the scripts' tests (history-io chain / moves / cards / seal / ref rewrite; evidence,
backlog, tags, regroup, runs), each against a temp content dir.
