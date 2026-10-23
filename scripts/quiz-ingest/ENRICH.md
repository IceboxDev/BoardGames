# Worker instructions — enrich a batch of quiz articles (proofread · answer marks · Russian · images)

You own a batch of articles of the quiz bank (your prompt lists their ids). You edit ONLY those
files: `packages/core/src/quiz/content/articles/<id>.json` in the repo
`/var/home/mantas/Documents/Projects/Personal/BoardGames`. **Do NOT touch git, any other file, or
use the Agent tool; never `pkill`/`kill` by pattern** — `pkill -f` also matches the shell running it
and other workers' processes. To stop your own background job use the TaskStop tool with its task
id, or run long checks with a `timeout 120` prefix so they can't hang. Other workers edit other articles at the same
time. Keep helper scripts in `/var/home/mantas/Downloads/quiz-cards/trivial-pursuit/scratch/enrich-<first-id>/`.
Before starting, grep `/var/home/mantas/Downloads/quiz-cards/trivial-pursuit/enrich-notes.md` for your
article ids — it lists known problems the merge left (fix them).

Read first: `packages/core/src/quiz/content-types.ts` (the article shape), and one of your articles
in full. Each article: `titleEn/De`, `bodyEn/De` (Markdown: paragraphs, tables, lists), `notesEn/De`,
`images`, and 1–8 `facts` — each with `answerEn/De`, `spans` (`[start, length]` of the answer inside
each body, UTF-16 code units = Python `str` indices for these texts), `timeline`, `source`, and
`wordings` (`en`, `de`, `origin` printed|generated, optional `printed`, optional `cardText`).

For EVERY article of your batch, do all five steps, then save it.

## 1. Proofread (EN + DE)

- Every fact: is the answer correct for its wordings? Verify on a page you fetch (the fact's `source`
  first). Fix wrong answers, wrong premises, outdated statements ("is the current …"), broken or
  ambiguous wordings; a fix that changes the answer must also fix the body and, if needed, the
  `source`/`timeline`. Log every content change (see Report).
- **No yes/no, true/false or multiple-choice wordings.** Rework them into open questions about the
  same fact (and adjust the answer). For a `printed` wording keep the card's words in `cardText`
  (set it to the old `de` if it isn't set yet), then replace `de`/`en` with the open question.
- The body: factual errors, typos, broken sentences, EN/DE disagreement fixed; voice, length,
  tables and lists kept. Every answer stays in both bodies.
- Notes: player-facing, faithful in both languages ("" when none).
- Answers read as plain answers: grading hints in an answer ("(any three)", "(accept …)", "bis zu",
  doubled forms like "6 sextillion tonnes (6 × 10²¹ t)") move to the notes, and the answer becomes
  the clean phrase the body can carry naturally (e.g. "Mercury, Venus, Earth and Mars").
- Articles written by the merge may contain background details from memory (dates, figures that
  are not answers): check every number and date in the body against a page you fetch.

## 2. Answer marks in the right place

The study card shows the sentence around each fact's span as the "From the article" quote, and the
wiki highlights it. The span must sit on the occurrence of the answer in the sentence that
actually GIVES THE ANSWER — the sentence that would answer the wording — not merely the first
occurrence (a table cell, a heading, a passing mention). For each fact and language:
- find the best sentence; set `spans.<lang> = [index, len(answer)]` with Python
  (`i = body.find(answer, body.find(sentence_start))`; case may differ — then the slice must equal
  the answer case-insensitively);
- if no sentence states the fact clearly, rewrite one (in all languages) so that it does.
- `check-bank` only tests that the slice matches. Check yourself that no span lands in a table
  row (a line starting with `|`), a heading, or inside a longer word (letters right before/after
  the slice — e.g. a Russian stem inside an inflected form, "Heart" inside "Lionheart").

## 3. Russian

Translate into natural, correct Russian (same content, not a summary):
- `titleRu`, `bodyRu` (same Markdown structure, tables/lists kept), `notesRu` ("" when none);
- every fact's `answerRu` — short, canonical, in the nominative as it would be quoted in running
  text; names in standard Russian transliteration (Гёте, Брехт, Мюнхен), numbers as digits;
- every wording's `ru` (the open question);
- every `timeline.labelRu`;
- `spans.ru` placed like the others (step 2) — `answerRu` must appear in `bodyRu` exactly
  (case-insensitive) in the right sentence; adjust the sentence's grammar so the nominative answer
  fits, or choose an answer form that reads naturally there.

## 4. At least one image

Find at least one INFORMATIVE image that teaches something about the article: the book's cover or
first edition, portraits of the people it is about, the building/artwork itself, the animal/plant,
the device, a patent drawing or diagram of the concept, a map, an infographic of the field. Not
decorative fluff. Wikimedia is preferred (stable): the Wikipedia REST summary
`https://en.wikipedia.org/api/rest_v1/page/summary/<Title>` gives `originalimage`/`thumbnail`; use
the `originalimage` `upload.wikimedia.org` file URL (or a `thumbnail` URL exactly as the API returns
it — a hand-made `/thumb/…/NNNpx-…` width can answer HTTP 400), with any `?utm_…` or other tracking query removed. Other sites are fine if stable.
Licensing doesn't matter (private, non-profit use).
- Wikimedia often answers 429 over IPv6: add `-4` to every curl (forces IPv4), and pause between
  requests.
- Verify the URL serves an image: `curl -4 -sIL -A 'QuizContentCheck/1.0 (private quiz trainer; contact quiz-content-check@users.noreply.local)' "<url>"` → final status 200
  and `content-type: image/*`. Wikipedia rate-limits (429): back off and retry, never invent a URL.
- Add to `images`: `{ "url", "pageUrl" (where it's from), "width"?, "height"?, "alt": {en,de,ru},
  "caption": {en,de,ru}, "credit"? }` — the caption says what the image shows and why it matters
  for this article (one or two sentences, all three languages).
- Several people/things → several images are welcome (put the most informative first).

## Top-up (only articles the notes list as thin)

An article with fewer than 4 facts gets new GENERATED facts until it has 4–5: open questions on the
article's topic, one short verifiable answer each, answers different from every other fact of the
article and not already asked elsewhere in the bank (grep the articles folder for the answer). Each
new fact: `{ id, answerEn, answerDe, answerRu, spans, timeline, source, wordings: [{ id, en, de, ru,
origin: "generated" }] }` like the existing ones. Ids: use ONLY the ranges in your prompt (`f…`
and `w…` counting up from the given start, max 20 each) — other workers allocate other ranges.
Extend the bodies so each new answer sits in a sentence that gives it.

## 5. Save and check

Write the file with Python, ATOMICALLY (other workers' checks read the whole folder): dump to
`articles/.<id>.json.tmp` (`json.dump(article, f, ensure_ascii=False, indent=1)` + a final newline),
then `os.replace` it onto `articles/<id>.json`, keeping every existing field and id (never change ids, never delete facts or wordings — a fact
leaves play only by moving to the article's `retired` list, with `{at, reason, replacedBy?}`).
Then run from the repo root:

```bash
pnpm -s quiz-ingest check-bank --complete <your article ids…>
```

It must report 0 problems for your articles (Russian everywhere, spans matching their answers,
an image, no yes/no / choice wording, schema valid). Fix until clean. Re-read each changed sentence
once more in all three languages.

## Changelog reasons

Every change is logged in the bank's history by the coordinator, from a reasons file you write
next to your report: `/var/home/mantas/Downloads/quiz-cards/enrich-report/<first-id>-<last-id>.reasons.json`
— one key per changed entity (article, fact or wording id) →
`{"kind": "...", "reason": "...", "sources": [{"url": "..."}], "fields": ["..."]}` (or a list of
those split by `fields`). Kinds: corrected, errata, reworded, translated, marked, illustrated,
created, retired, restored, split, moved, edited, flagged. Reasons are for a reader who wasn't
there: what was wrong and why the new text is right. Do not run `quiz-ingest log` yourself.

## Report

Write `/var/home/mantas/Downloads/quiz-cards/enrich-report/<first-id>-<last-id>.md`:
```
# <first-id>–<last-id>
## Content changes
- aNNNN fNNNNN: <field>: "old" → "new" — why — <source url>      (or "none")
## Reworked questions
- wNNNNN: "old" → "new"                                          (or "none")
## Low confidence
- …                                                              (or "none")
```
End your final message with: `ENRICHED: <n> articles · CHECK: PASS` (or `CHECK: FAIL — <ids, reason>`).
