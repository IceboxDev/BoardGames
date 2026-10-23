# Worker instructions — one question, one fact (splits and restores)

The quiz bank's rule is now: **a fact is ONE question with its answer.** Your
items are questions that were wrongly attached to another fact, or retired facts
that turned out to ask their own question. You give each one its own active fact.

Repo: `/var/home/mantas/Documents/Projects/Personal/BoardGames`. Articles are
`packages/core/src/quiz/content/articles/<id>.json` (shapes:
`packages/core/src/quiz/content-types.ts` — read `FactSchema`, `RetiredFactSchema`,
`ArticleSchema`). Edit ONLY the article files your items name (plus another
article if you must move a fact there, see 3). **Do NOT touch git, the
`history/` folder, any other file, or use the Agent tool; never `pkill`/`kill`
by pattern.** Scratch scripts go in
`/var/home/mantas/Downloads/quiz-cards/one-question/scratch-<N>/`.
Write files atomically with Python (`json.dump(a, f, ensure_ascii=False, indent=1)`
+ final newline to `articles/.<id>.json.tmp`, then `os.replace`).

## Items (your file lists them)

- `SPLIT <wordingId> FROM <factId> IN <articleId>` — move that wording out of the
  fact into a NEW fact of its own (the old fact keeps its other wordings and its id).
- `RESTORE <factId> IN <articleId>` — move the fact from the article's `retired`
  list back to `facts` (remove its `retired` field; keep its id and wordings).

## For every new or restored fact

1. **Answer + question.** Check the question and answer against a page you fetch
   (Wikipedia preferred). The answer may stay the same text as another fact's —
   that is fine now. Fix a wrong premise in the question (for a printed wording
   keep the card's words in `cardText`, setting it to the old `de` if unset).
   No yes/no or choice questions.
2. **Fields.** A new fact: `{ id, answerEn, answerDe, answerRu, spans, timeline,
   source, wordings: [<the moved wording>] }`, ids from your reserved range only
   (`f…` counting up from the start you're given). A restored fact keeps its id;
   fill whatever it lacks: `answerRu`, every wording's `ru`, `timeline.labelRu`,
   `spans` for en/de/ru. `timeline` = the dated event THIS question is about;
   `source` = a page that confirms THIS question's answer.
3. **Placement.** Keep it in the same article when the article then has at most 8
   active facts. Otherwise move it (or a fitting generated fact) to another
   article of the same sub-category that covers the topic — never more than 8
   active facts anywhere. Moving a fact keeps its id.
4. **The body must teach it.** The answer must appear (en, de, ru) in a sentence
   of the body that gives THIS question's fact; add or rewrite a sentence in all
   three languages if none does. Set `spans.<lang> = [index, len(answer)]` on that
   sentence (UTF-16 = Python str indices), never in a table row, heading, or
   inside a longer word. Other facts' spans must be re-set if your body edit
   shifted them (recompute every fact's spans after editing a body).
5. **Russian** must be complete for what you add (answer in the nominative,
   wording, timeline label, spans).

## Reasons file (the changelog)

Every change is logged by the coordinator from your reasons file. Write
`/var/home/mantas/Downloads/quiz-cards/one-question/reasons-<N>.json`:

```
{
  "<newFactId>": {"kind": "split", "reason": "Asks which unit is named after Newton — a different question from f01234 (which unit measures force), so it is a fact of its own.", "sources": [{"url": "https://…"}]},
  "<movedWordingId>": {"kind": "split", "reason": "Moved from f01234 to its own fact f25001: it asks a different question."},
  "<restoredFactId>": [
    {"kind": "restored", "reason": "Asks about the Great Red Spot, not the planet's size (f00099); a question of its own.", "fields": ["retired"]},
    {"kind": "translated", "reason": "Russian answer and timeline label added.", "fields": ["answerRu", "timeline"]},
    {"kind": "marked", "reason": "Answer marked on the sentence about the Great Red Spot.", "fields": ["spans"]}
  ],
  "<articleId>": {"kind": "edited", "reason": "Added a sentence about the Great Red Spot so the restored fact has one that gives it.", "fields": ["bodyEn", "bodyDe", "bodyRu"]},
  "<otherFactIdWhoseSpansShifted>": {"kind": "marked", "reason": "Answer marks re-set after the body edit."}
}
```

One key per changed entity (article, fact or wording); several reasons may split
an entity's changed fields with `fields`. Kinds: split, restored, moved, edited,
corrected, errata, reworded, translated, marked, created. A wording whose `ru`
you added needs a key too (`translated`).

## Check

Run from the repo root: `pnpm -s quiz-ingest check-bank --complete <your article ids…>`
— 0 problems for your articles. End your final message with
`SPLIT: <n> items · CHECK: PASS` (or FAIL with the reason).
