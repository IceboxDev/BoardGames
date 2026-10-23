# Worker brief: reshape a category's fact counts (retire weak facts · add researched facts)

Repo: `/var/home/mantas/Documents/Projects/Personal/BoardGames`. Quiz bank: `packages/core/src/quiz/content/articles/aNNNN.json` (shape: `packages/core/src/quiz/content-types.ts` — read it first; conventions: `scripts/quiz-ingest/ENRICH.md` — read it, especially Proofread rules, "Answer marks", "Russian", "Top-up" and "Save and check").

The owner wants every one of the 14 categories to have EXACTLY: 10 articles with 8 active facts, 10 with 7, 30 with 6, 120 with 5, 30 with 4 (= 200). Your quota file `/var/home/mantas/Downloads/quiz-cards/rework/out/<unit>.quota.json` tells you, per current fact-count level (`levels.<n>`), the candidate articles at that level and `assign`: how many of them must END at each target count (e.g. level "7": {"8": 2, "7": 10, "6": 5} = of these 17 articles, pick the 2 with the most potential to gain a fact, keep 10, and take 5 down to 6 facts). You choose WHICH articles; the counts are exact. Articles you are not asked to move stay untouched.

## Choosing (owner's words)
- Up (gain facts): "expand the ones that have the most potential to be expanded" — rich topics where an obvious, good trivia question is missing.
- Down (lose facts): "retire the ones that are the most forced and/or least fitting … unfitting and distasteful uncreative useless non-trivia facts". Rank by the WEAKEST retirable fact of each candidate: a question that is forced, off-topic for its article, a near-duplicate of another fact, dull/uncreative (pure date/number lookups nobody would enjoy), tasteless, or not real trivia. The articles whose weakest fact is worst go down, and that fact is the one retired.
- Dump the candidates compactly first (title + each active fact's English wording + answer + origin), with a script, and judge across the whole level, not first-come.

## Retiring a fact
- ONLY a fact whose every wording (active and retired) has `origin: "generated"`. A fact with any printed wording is never retired (cards point at it). If a candidate has no retirable fact, it can't go down — pick another.
- Move the fact object whole from `facts` to the article's `retired` list (create it if absent; append), adding `"retired": {"at": "2026-10-23", "reason": "<one sentence for a reader: why this question was the weakest of the article>"}`. Keep its ids and fields. The body may keep the sentence; don't rewrite bodies for a retirement.
- Going down two levels (rare) = retire two facts.

## Adding a fact (up)
- A new GENERATED fact per ENRICH.md "Top-up": an open question (no yes/no, true/false, multiple choice) with ONE short verifiable answer, different from every other answer of the article, and not already asked anywhere in the bank (grep `articles/` for the answer and key words). Real trivia people enjoy — not a filler date lookup.
- Research it properly: fetch a reputable page (WebFetch/WebSearch/curl -4) and verify the answer; ideally two independent sources for numbers, dates and superlatives ("first", "only", "largest"). Never invent a URL.
- Fact shape: `{id, answerEn, answerDe, answerRu, spans:{en,de,ru}, timeline:{kind,start,end,precision,approx,ongoing,labelEn,labelDe,labelRu}, source:{url,title,lang}, wordings:[{id, en, de, ru, origin:"generated"}]}` — copy the exact shape of an existing fact.
- INTEGRATE, don't slap-append: rewrite or extend the body passage where the topic naturally belongs, in all three languages (`bodyEn/De/Ru`), so the new answer sits in the sentence that gives it and the article still reads as one coherent page. Then set spans for the new fact AND recompute spans of every other fact whose position shifted (Python str indices; `[start, len(answer)]`; never inside a table row, heading, or a longer word).
- Ids: ONLY your range (in the quota file: `factIds`, `wordingIds`), counting up. Never more than 8 active facts.

## Rules
- Edit ONLY the article files listed in your quota (`articles`). **Do NOT touch git, other repo files, or use the Agent tool; never `pkill`/`kill` by pattern** (17 other workers run beside you). Scratch scripts in `/var/home/mantas/Downloads/quiz-cards/rework/scratch-<unit>/`; run python with `-I`.
- Save atomically: `json.dump(a, f, ensure_ascii=False, indent=1)` + "\n" to `articles/.<id>.json.tmp`, then `os.replace`.
- Check from the repo root: `timeout 600 pnpm -s quiz-ingest check-bank --complete <changed ids…>` → 0 problems for your articles.
- Finally verify with a script that your candidate articles' final fact counts match `assign` exactly.

## Output
- `/var/home/mantas/Downloads/quiz-cards/rework/out/<unit>.reasons.json`: one key per changed entity → `{"kind", "reason", "sources"?: [{"url"}], "fields"?: [...]}` (or a list split by fields). A retired fact → key = fact id, kind `"retired"`, reason = the retire reason. A new fact → key = fact id, kind `"created"` (with sources); its wording → key = wording id, kind `"created"`. Body/title changes → key = article id, kind `"edited"`. Facts whose spans only shifted → key = fact id, kind `"marked"`, fields ["spans"]. Do not run `quiz-ingest log`.
- `/var/home/mantas/Downloads/quiz-cards/rework/out/<unit>.moves.json`: `[{"article", "from", "to", "retired": [{"fact", "question", "why"}], "added": [{"fact", "question", "answer", "source"}]}]`.

End your final message with: `DONE: <unit> · added <n> · retired <n> · moves <from→to: count, …> · CHECK: PASS|FAIL`.

## New-article units only
Your quota lists `newArticles` {domain: article id}. For each domain: read every title/sub of that domain in `packages/core/src/quiz/content/index.json` and the domain's subs in `packages/core/src/quiz/taxonomy.ts`; choose the most important topic MISSING from the category — not a duplicate of an existing article's topic, not in an already overloaded sub (prefer a sub with fewer articles). Write a full article in the house style (look at 2–3 articles of that sub): `id, domain, sub, titleEn/De/Ru, bodyEn/De/Ru` (~400–600 words each, Markdown), `notesEn/De/Ru` ("" when none), `images` (≥1 informative image, verified per ENRICH.md step 4), and exactly 4 GENERATED facts (rules above, each answer in the sentence giving it, spans in all languages). Facts/wordings from your id ranges. Create the file atomically; `check-bank --complete <id>` must pass. Reasons: the article id → kind "created"; each fact and wording id → "created". Moves file: `[{"article", "from": 0, "to": 4, "topic", "why this topic"}]`.
