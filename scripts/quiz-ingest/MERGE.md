# Worker instructions — merge ONE bucket of printed questions into the quiz bank

A bucket is one (domain, sub-category) of the taxonomy. You decide how its printed questions join
the bank. You never edit the bank's files: you write one decision file and validate it.
**Do NOT touch git, do NOT use the Agent tool, do NOT edit repo files, never `pkill`/`kill` by
pattern (other workers run beside you).** Keep helper scripts in `$WORK/scratch/merge-<stem>[.<shard>]/`. Your prompt gives `WORK`
and `BUCKET` (e.g. `history/ancient`); its file stem is `<domain>__<sub>` (e.g. `history__ancient`).

Read first:
- `$WORK/candidates/<stem>.md` — the bucket's own articles (id, title, facts/8, `baseHash`), then
  every printed question of the bucket as `{ "card", "category" }` with its question, answer, notes,
  the bank's facts it may already be, and articles on nearby topics.
- The printed cards themselves if you need more (`$WORK/printed/<card>.json`).
- The articles you may change: `packages/core/src/quiz/content/articles/<id>.json`.
- `packages/core/src/quiz/taxonomy.ts` — domains and sub-categories.

## The model

An **article** is a whole topic page (~350–600 words per language) everyone reads in full; it
covers **1–8 active facts**. A **fact** is ONE question and its answer — the answer appears in every
body. Its **wordings** are that same question as each source words it (a printed card, or ours);
a different question that happens to share the answer is a different fact. Members' progress hangs
off fact ids: never invent, renumber or delete facts — a fact leaves play only by being retired
(it moves to the article's `retired` list and is kept forever).

## Decide every printed question of the bucket — exactly one of

1. **alias** — the bank already asks THIS question (same subject, same relation asked, same answer;
   only the phrasing differs — someone who knows one answers the other for the same reason).
   The fact may be ANYWHERE in the bank, any bucket:
   `{ "op": "alias", "printed": { "card": "tp-021", "category": 3 }, "factId": "f…" }`.
   SAME ANSWER is a hint, not proof — check that the question really asks the same fact. A question
   about a different subject that happens to share the answer ("which family is the peanut?" vs
   "which family are beans?") is a NEW fact, never an alias.
   Aliasing a homebrew (generated) fact is welcome: apply retires its homebrew wording, since a
   printed question replaces it.
2. **add-facts** — a new fact for one of THIS bucket's articles. Rewrite the WHOLE article (EN,
   then translate to DE) so it reads as one coherent page and contains every answer — old and new —
   verbatim (case-insensitive). Keep its voice, tables, lists, and every existing answer.
   ```json
   { "op": "add-facts", "articleId": "a…", "baseHash": "<from candidates>",
     "facts": [{ "printed": { "card": "tp-021", "category": 3 } }], "drop": [],
     "article": { "titleEn": "…", "titleDe": "…", "bodyEn": "…", "bodyDe": "…", "notesEn": "", "notesDe": "" } }
   ```
   Over 8 facts → retire GENERATED facts first (`drop: ["f…"]` moves them to the article's
   `retired` list — never one with a printed wording); still too full → **split**. Several questions for one article go in ONE add-facts operation.
3. **new-article** — a new topic in this bucket: the printed fact(s) plus ~4 generated facts on the
   same sub-topic and in the same question form (open questions only, one short verifiable answer
   each, all answers different), each `generated` with `de`, `en`, `answerDe`, `answerEn`,
   `timeline`, `source` (a page you fetched — never an invented URL; timeline rules as in
   `TRANSCRIBE.md`). Related printed questions of the bucket may share one new article.
   ```json
   { "op": "new-article",
     "facts": [{ "printed": { "card": "tp-055", "category": 2 } },
               { "generated": { "de": "…", "en": "…", "answerDe": "…", "answerEn": "…", "timeline": { … }, "source": { … } } }],
     "article": { … } }
   ```
4. **split** (only a full article of this bucket) — 2+ complete sub-topic articles; every existing
   fact in exactly one part (`factIds`), the first part keeps the id, new facts may join any part.
5. **handoff** — the question clearly belongs to ANOTHER sub-category (the transcriber's guess was
   wrong) and isn't an alias: list it in `handoff` with the right `domain`/`sub` and a reason; the
   coordinator merges it there in a second round.

No yes/no, true/false or multiple-choice questions anywhere — generated ones included.

Two facts may share an answer, even in one article, when they ask different questions (each needs a
body sentence that gives it). The validator refuses only the same question twice.

Every change you cause is logged in the bank's history (`content/history/`) when the coordinator
applies the decisions — new printed wordings as printed (with the card), new facts and articles as
created, rewrites as edited, retired facts with their reason.

## Write and validate

Write `$WORK/decisions/<stem>.json`:
```json
{ "source": "trivial-pursuit", "bucket": "<BUCKET>", "operations": [ … ], "handoff": [ … ] }
```
Then from the repo root (`/var/home/mantas/Documents/Projects/Personal/BoardGames`):
`pnpm -s quiz-ingest apply $WORK <BUCKET>` — it must run without an error (a missing answer in a
rewrite, a question used twice, an article outside the bucket, a changed baseHash, > 8 facts …).
The `unused` it lists must be exactly the other buckets' questions — every question of YOUR bucket
is either used or in `handoff`. Fix and rerun until clean.

## Report

End with exactly:
```
DECISION: <WORK>/decisions/<stem>.json
SUMMARY: <n> alias · <n> add-facts · <n> new-article · <n> split · <n> handoff
```

## Shard mode (big buckets)

If your prompt also names a SHARD (e.g. `g2`), the bucket was split by `$WORK/plans/<stem>.json`:
- decide ONLY the questions listed in your shard (other shards' workers decide the rest);
- add-facts / split ONLY the articles listed in your shard; new articles freely (your shard's
  topics); aliases anywhere as usual;
- write `$WORK/decisions/<stem>.<shard>.json` (same `source`/`bucket` fields);
- validate with `pnpm -s quiz-ingest apply $WORK <BUCKET> --part=<stem>.<shard>` — every question of
  YOUR shard must be used or in `handoff`; ignore questions of the other shards in `unused`;
- end with `DECISION: <path>` and the SUMMARY line as above.

## Round 2 mode (handed-off questions)

If your prompt says ROUND 2, you place the questions the first round handed to your bucket (and
first-round questions whose answer repeated another fact's in the same article):
- read `$WORK/candidates/r2__<stem>.md` (each question's notes say why it came to you);
- read articles from the STAGED bank `$WORK/staged/articles/<id>.json` — the bank after the first
  round, which the repo's own content folder does not show yet; the `baseHash` values in the r2
  candidates file are computed on that staged bank;
- decide every question listed (alias / add-facts / new-article / split as above, in your bucket);
  no handoff in round 2 — if a question really fits nowhere else, give it a new article here;
- write `$WORK/decisions/zz-r2-<stem>.json` (same `source`/`bucket` fields);
- validate with `pnpm -s quiz-ingest apply $WORK --round2=zz-r2-<stem>` — it applies the whole first
  round, then your file; it must run without an error;
- end with `DECISION: <path>` and the SUMMARY line.
