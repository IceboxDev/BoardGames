# Worker instructions — post-merge dedupe of the quiz bank

The Trivial Pursuit merge is applied. Parallel merge workers each saw only their own sub-category, so
a few topics now exist twice and a few printed questions were attached to a loosely matching fact.
You fix the items listed below by editing the bank's article files directly.

Repo: `/var/home/mantas/Documents/Projects/Personal/BoardGames`; articles are
`packages/core/src/quiz/content/articles/<id>.json` (shape: `packages/core/src/quiz/content-types.ts`).
**Do NOT touch git, do NOT use the Agent tool, never `pkill`/`kill` by pattern.** Keep scripts in
`/var/home/mantas/Downloads/quiz-cards/trivial-pursuit/scratch/dedupe/`. Find articles with `grep -l`.

## Rules
- **Never change or reuse an id** (articles `aNNNN`, facts `fNNNNN`, wordings `wNNNNN`); members'
  progress hangs off fact ids. A fact may MOVE to another article with its id, wordings and timeline.
- Never delete a fact that has a `printed` wording. A duplicate GENERATED fact (same question and
  answer as another fact) may be deleted — prefer keeping the older/lower id.
- To merge two articles on one topic: move the facts of one into the other (max 8 facts per article,
  no two facts with the same answer in one article), rewrite the receiving article's EN and DE body so
  it reads as one page and contains every answer verbatim, then delete the emptied article file.
  If both together exceed 8 facts, instead make the two articles clearly distinct (rename/reshape
  so they cover different angles) and remove the duplicated generated facts.
- A printed wording attached to a fact that asks something different (a wrong alias): move that
  wording into a NEW fact (next free fact id = highest existing `f` id + 1) in an article that
  supports it (answer verbatim in both bodies), with `answerEn/De`,
  `timeline` and `source` copied or researched. If it truly is the same fact, leave it.
- Answers must appear verbatim in both bodies; keep tables/lists; keep both languages in step.
- Whenever you change a body, re-set every fact's `spans.en`/`spans.de` = `[index, len(answer)]` with
  Python (`body.find(answer)`, case-insensitive match allowed), on the sentence that gives the answer;
  rebuild does not move spans, it only validates them.
- After every few edits run from the repo root:
  `pnpm -s quiz-ingest rebuild` (re-indexes and validates the whole bank; it must succeed).

## Items
1. "Niagara daredevils" exists twice (sport-games/motor-winter and history/contemporary) — merge.
2. Zeppelins: modern-history "Zeppelins (Lakehurst)" vs technology/transport "Airships" — merge or
   make distinct.
3. "Odd world championships" exists in sport-games/games AND everyday/leisure (both have wife
   carrying and bog snorkelling); Double Gloucester cheese-rolling also appears in everyday/holidays
   "Festivals as spectacle" — keep each fact once.
4. Space Oddity / Chris Hadfield: music-stage "Music in space" vs earth-space "Life aboard the
   station" — keep the fact once.
5. Adolf Grimme generated in both the TV-awards article (film-media/tv) and the journalism-prizes
   article (film-media/media) — keep once.
6. International Klein Blue in art/design (colours) and art/painting (a1179) — keep once.
7. Business "Firsts of German advertising" generated Litfaß and Mainzelmännchen, which have their own
   articles (a0810; the Mainzelmännchen article in film-media/tv) — remove duplicate facts.
8. Fitzgerald/Hemingway: classics "The Lost Generation" vs modern-lit "American First Novels" and
   "Hemingway's Cuba" — remove duplicated facts, keep the articles distinct.
9. Poetry "Curious lives of poets" generated "Nerval's lobster"; printed tp-159 also asks it —
   keep the printed one, delete the generated duplicate.
10. Cities: "Copies of Europe Around the World" vs "China's copycat towns" (Thames Town,
    Tianducheng, Hallstatt) — keep each fact once, articles distinct.
11. Dog tax: society/law "Dogs and German Law" vs society/politics "German taxes" — keep once.
12. Mike Tyson: sport-games/olympics "Mike Tyson" article vs fact f03562 (Tyson) elsewhere — check,
    remove duplicated facts.
13. Wrong-alias checks: tp-298 (Xena series title) on f05117; tp-354 (Hermitage cats) on f02293;
    tp-399 (Mekong vs Mississippi) on f10547; tp-177 (lowest resort) on f09350; tp-041, tp-303,
    tp-345 (different plants sharing a family answer) on f02634, f02091, f02095. Find each by the
    printed wording (`"card": "tp-…"`). Same fact → leave; different → new fact as above.
14. Then scan the whole bank for further exact duplicates: facts whose `answerEn` AND English
    question are near-identical (normalise case/punctuation) in different articles. Remove generated
    duplicates; list printed ones you leave in the report.

## Report
Write `/var/home/mantas/Downloads/quiz-cards/trivial-pursuit/dedupe-report.md`: per item what you
did (moved / deleted / new fact ids, articles deleted). End with
`DEDUPE: <n> items · REBUILD: PASS` (or FAIL with the error).
