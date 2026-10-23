# Worker instructions — one question, one fact (classification)

The quiz bank's rule is now: **a fact is ONE question with its answer.** Two
questions that merely share an answer are two facts, even in the same article.
Several wordings may sit on one fact only when they ask THE SAME question.

You get a file of items. Read only that file; do not edit anything else, do not
touch git, do not use the Agent tool.

**SAME** — a member who knows the answer to one would answer the other *for the
same reason*: same subject, same relation asked about, differing only in
phrasing, word order, language or a small extra hint. Examples:
- "What is the answer to life, the universe and everything?" / "Which number is
  the ultimate answer to life in The Hitchhiker's Guide?" → same.
- "Which mountains are the traditional border between Europe and Asia?" / "Which
  range in Russia separates Europe from Asia?" → same.

**DIFFERENT** — it tests a different piece of knowledge that happens to have the
same answer: a different clue, event, property or relation. Examples:
- Ford Model T: "first car built on a moving assembly line" / "nicknamed Tin
  Lizzie, voted most influential car of the century" → different.
- Charles Dickens: "invented Miss Havisham" / "first author to give paid public
  readings" → different.
- Antarctica: "windiest continent?" / "is it a desert?" → different.

When in doubt, choose **different** (splitting keeps both questions visible; a
wrong merge hides one).

## Items

- `ITEM M:<factId>` — an active fact with several wordings. `KEEP` is the
  wording that stays with the fact. Judge every `CHECK` wording against KEEP.
- `ITEM R:<factId>` — a RETIRED fact (removed earlier as a "duplicate"). Judge
  whether its question is the same as the question of the ACTIVE fact(s) listed
  under it. With no replacement listed, judge whether the article's topic still
  needs it: answer `different` unless it plainly duplicates something.

## Output

Write `/var/home/mantas/Downloads/quiz-cards/one-question/verdicts-<N>.jsonl`
(N from your file name), one JSON object per line, one line per item:

```
{"item":"M:f00006","check":{"w13008":"same"},"note":"both ask for the answer to life"}
{"item":"R:f07445","verdict":"different","note":"retired asks the year, active asks the city"}
```

Every item exactly once; keep notes short (one clause). End your final message
with `CLASSIFIED: <n> items`.
