# Worker brief: tag one category and link it to Wikidata

Repo `/var/home/mantas/Documents/Projects/Personal/BoardGames`. Quiz bank articles: `packages/core/src/quiz/content/articles/aNNNN.json`. Read first: `packages/core/src/quiz/tags.ts` (parseTag, facetAccepts, derivedTags), `packages/core/src/quiz/content/tags.json` (the registry), `packages/core/src/quiz/content-types.ts` (`tags?: string[]`, `entities?: {qid, label, role: "subject"|"answer"|"mentioned"}[]` on Article and Fact).

Purpose (owner): tags make future regrouping, splitting and merging of categories straightforward; Wikidata entities make dedupe, region and era reliable. Your prompt names YOUR domain; edit only articles whose `domain` is yours, and only the `tags` and `entities` fields (of the article and of its ACTIVE facts). Never touch other fields, retired facts, or other domains.

## Tags (stored; never store derived facets era/source/printed — they're computed)
Article level:
- `topic:<path>` 1–2 per article — a hierarchical, lowercase-hyphen path, depth 2–3, rooted in a broad subject (NOT the current domain name, since domains may be regrouped later): e.g. `topic:music/opera`, `topic:music/rock`, `topic:film/animation`, `topic:literature/crime-fiction`, `topic:history/world-war-2`, `topic:politics/germany`, `topic:religion/christianity`, `topic:mythology/norse`, `topic:science/chemistry`, `topic:medicine/anatomy`, `topic:astronomy/planets`, `topic:animals/birds`, `topic:plants/trees`, `topic:technology/computing`, `topic:games/board-games`, `topic:sport/football`, `topic:food/cheese`, `topic:language/etymology`, `topic:art/painting`, `topic:architecture/landmarks`, `topic:geography/rivers`. Reuse paths consistently; prefer an existing root over inventing synonyms. Write your final topic list with counts to your output file.
- `region:<iso2|continent|world>` when the article is about a place/country/culture (lowercase ISO 3166-1 alpha-2 like `de`, `fr`, `us`; or `europe`, `asia`, `africa`, `north-america`, `south-america`, `oceania`, `antarctica`, `world`). 0–3.
- `audience:de-specific` when the article needs German cultural knowledge (German TV, politics, brands, idioms); `audience:international` otherwise.
Fact level (only when it adds information):
- `topic:` / `region:` only if the fact differs from its article.
- `risk:number` (answer is a figure/quantity), `risk:superlative` (asks the first/only/largest/oldest…), `risk:contested` (sources disagree — notes usually say so), `risk:which-not` (card asks which is NOT…), `risk:time-sensitive` (answer can change: current holder, record, "as of").
- `difficulty:easy|medium|hard` for EVERY active fact — your honest estimate for a well-read German adult quiz player (easy ≈ most get it, hard ≈ few).
- `form:`/`answer:` are derived automatically; store them only to correct a wrong derivation (check `derivedTags` output for a few facts).
Validate each tag with the registry (`facetAccepts`); unknown facet values are errors (topic/region are open).

## Wikidata entities
- Article: 1–3 `role:"subject"` entities (the person/work/place/organisation/concept the article is about). Concepts without a clear item: skip.
- Fact: `role:"answer"` entity when the answer is a named entity (person, place, work, organisation, taxon, event, building, ship…); not for numbers, dates, generic terms. Optionally `role:"mentioned"` for the key entity a question is about if it differs from the article subject.
- Find candidates with the API, politely (User-Agent 'BoardGamesQuizTagger/1.0 (private quiz trainer; contact quiz-content-check@users.noreply.local)', ≤ 1 req/s (14 agents run at once — batch ids in wbgetentities, cache everything), curl -4, back off on 429): `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=<label>&language=en&uselang=en&limit=5&format=json`, then VERIFY with `action=wbgetentities&ids=Q1|Q2…(≤50)&props=labels|descriptions|claims&languages=en|de&format=json` that the item really is the thing (description/instance-of/dates match the article). Never guess a Q-id from memory. `label` = the English label from Wikidata.
- Ambiguous (several plausible items, none clearly right) → skip; precision over recall.

## Rules
- Save atomically: re-read the article JSON right before writing, set only the fields, `json.dump(a, f, ensure_ascii=False, indent=1)` + "\n" to `articles/.<id>.json.tmp`, `os.replace`. Other agents edit other domains concurrently.
- No git, no Agent tool, never `pkill`/`kill` by pattern. Scripts in `/var/home/mantas/Downloads/quiz-cards/provenance/tags/scratch-<domain>/`; python with `-I`; cache API responses there.
- Check: `timeout 600 pnpm -s quiz-ingest check-bank --tags` (run from the repo root) → 0 problems for your articles; and `pnpm -s quiz-ingest check-bank --complete <a few of your ids>`.
- Output `/var/home/mantas/Downloads/quiz-cards/provenance/tags/<domain>.json`: `{domain, topics: {path: count}, regions: {...}, difficulty: {easy, medium, hard}, risk: {...}, articlesWithSubject: n, factsWithAnswerEntity: n, skippedAmbiguous: [ids…]}`.
End your final message with `DONE: tags-<domain> · <counts> · CHECK: PASS|FAIL`.
