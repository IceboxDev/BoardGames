# DEDUPE PASS 2 (2026-09-25) — same FACT under different wording

Pass 1 removed identical events. Pass 2 removes events that are the same fact written differently ("Catan is published", "Kosmos publishes Settlers of Catan", both 1995). The test is `tools/near_dup_lib.same_fact`: same start/end dates AND strongly overlapping labels (for day/month dates: any shared word). The worklist is `tools/dedupe2_worklist.json` (id, question, answer, old event, the keeper with its label, other members); the checker is `tools/near_dup_check.py <cards>` and must PASS.
Rules are the same as pass 1 (below): a new event about THIS question (another genuine aspect when the deck repeats a fact — a person's lifespan, the finale, a sequel/adaptation, an award, the founding, a record, the word's first record, …), verified, not the same fact as ANY other question's event, date in both articles, source updated if needed, logged under `## Dedupe 2` in the card report. Only worklist questions of your own cards; never change a keeper. If near_dup_check flags a genuinely different fact that happens to share dates and a word, choose a different event anyway (keep the timeline unambiguous).

# DEDUPE PASS (2026-09-25) — read this first if you were sent to re-pin shared events

479 timeline events were shared by several questions (same start, end and label). For each, one "keeper" question keeps it; every other member is listed in `tools/dedupe_worklist.json` (id `cNNNsNNqI`, question, answer, old event, the keeper's question, other members) and must get a NEW event:
- about THIS question/answer — the most relevant datable thing for it. If the question is really the same fact as the keeper's (the deck repeats itself), pick another genuinely relevant aspect: the answer person's lifespan, the work's finale / sequel / adaptation / first performance, the founding, the discovery, the word's first record, a record being set … Never an unrelated proxy.
- verified (Wikipedia raw/REST, WebFetch) and not equal to ANY other event in the corpus — `python3 tools/dup_check.py <cards>` must PASS; also don't duplicate a sibling's fact in the same set.
- same format/precision rules as below; the date must appear in both articles (add a natural sentence in EN + DE if needed); change the `source` if the old one does not support the new event.
- log it in the card report under a `## Dedupe` section: `- sNNqI dedupe: "<old label>" → "<new label>" (<date>) — why`.
Only touch worklist questions of your own cards; never change a keeper.

# Quiztopia content enrichment — per-card recipe

Files: `~/Downloads/quiz-cards/json/<stem>.json` (one per card, 12 sets × 5 questions).
Card index `cNNN` = position in the sorted list of stems (c001 = IMG20260910164837).
Baseline (read-only): `~/Downloads/quiz-cards/json.bak-2026-09-24/`. The `json/` dir is a local git repo — `git -C ~/Downloads/quiz-cards/json diff -- <stem>.json` shows your changes. Never commit there.

Worked example: **c001 set 1** (`IMG20260910164837.json`, `sets[0]`) is already done — read it before starting.

## For every set (skip sets that already have `"enriched": true`)

### 1. Proofread
Read `article_en`, `article_de`, the five questions and answers.
- Fix factual errors, typos, broken sentences and EN/DE disagreements in the ARTICLES freely (keep the voice, length roughly the same, markdown tables/lists intact, German typography „…“, English article quoting style unchanged).
- Change a question or answer (`en`, `de`, `answer_en`, `answer_de`) ONLY if it is factually wrong or broken. Every such change goes in the card report as `- sNNqI: <field>: "old" → "new" — <why> — <source url>` (the checker requires the `sNNqI` token for any changed question).
- Every answer must still appear verbatim (case-insensitive) in its article.

### 2. One timeline event per question (never skip)
Pick the single most relevant datable thing for the question/answer pair:
1. the dated thing the question is about (publication, premiere, battle, treaty, founding, discovery, invention, record, election, launch …);
2. the answer is a person → their lifespan (`kind: "lifespan"`, birth → death; living people: `end: null, ongoing: true`);
3. a war, reign, era, movement → its interval;
4. a thing with no date of its own (a word, an element, an animal, a rule, a place) → when it was discovered / named / first described / founded / first recorded, at honest precision (`century`/`millennium` + `approx: true` if needed; `megayear` for deep time).

Prefer an event that is DIFFERENT from its siblings' when the facts allow (five pins at the same year on one article is poor), but never invent relevance.

```json
"timeline": {
  "kind": "event|lifespan|period|reign|creation|founding|discovery|era",
  "start": "1841-08-26",   // "YYYY" | "YYYY-MM" | "YYYY-MM-DD"; BCE = minus, no year 0: "-44-03-15" = 15 March 44 BC; deep time "-66000000"
  "end": null,             // same format, or null; must be after start
  "precision": "day",      // day|month|year|decade|century|millennium|megayear — MUST match start: YYYY-MM-DD→day, YYYY-MM→month, bare year→year/decade/century/millennium/megayear
  "approx": false,
  "ongoing": false,        // true only with end: null (living person, still-running thing)
  "label_en": "Hoffmann von Fallersleben writes the „Lied der Deutschen“ on Heligoland",
  "label_de": "Hoffmann von Fallersleben dichtet auf Helgoland das „Lied der Deutschen“"
}
```
- Labels: short (≤ 140 chars), readable on a timeline without the question, same fact in both languages. A lifespan label is "Name, role" ("Hanns Eisler, composer").
- Century precision: `start` = first year of the century ("1201" for the 13th c. is fine, "1200" also accepted), `approx` as appropriate. Decade: "1920".
- Day or month precision ONLY when verified.

### 3. The date must be in the article (both languages)
The checker requires the start year (and end year for intervals) to appear in BOTH `article_en` and `article_de` (digits, or for century/millennium/decade/deep-time precision the ordinal / "1920s" / "1920er" / "66 million" / "66 Millionen" forms). If missing, add a natural sentence or a parenthetical ("Hanns Eisler (1898–1962)"). When the article mentions the event's year and the exact day/month is known, upgrade it ("On 26 August 1841" / „Am 26. August 1841“). Edit with exact string replacement (assert the old text occurs once).

### 4. One source per question
```json
"source": { "url": "https://de.wikipedia.org/wiki/Das_Lied_der_Deutschen", "title": "Das Lied der Deutschen – Wikipedia", "lang": "de" }
```
- Must confirm the answer (and ideally the date). Any language (en/de/fr/…). Prefer the most specific Wikipedia article, else Britannica, museum / official / university pages.
- NEVER invent a URL. Only use a URL you fetched (WebFetch, or `curl -s -A QuiztopiaContentCheck/1.0 https://<lang>.wikipedia.org/api/rest_v1/page/summary/<Title>`) and that supports the fact. Wiki URLs use the canonical title with underscores (percent-encoding optional).
- Fast date verification: `curl -s -A x "https://en.wikipedia.org/w/index.php?title=<Title>&action=raw" | grep -o ".\{80\}1841.\{60\}"` (infobox `birth_date`/`death_date` for lifespans).

### 5. Editor notes
Keep `notes` untouched. Add `notes_en`, `notes_de`, `notes_internal` (all strings, `""` if none):
- **internal** — about how the card was transcribed or categorised ("Position is TL of the pink band…", "kept by position", "used as the first sibling", photo/crop remarks) → `notes_internal` only (never shown to players).
- **language-specific** — about wording/spelling/grammar that exists only in one language's text (a German misprint on the card that the English text doesn't carry, a German grammatical gender issue) → only that language's field.
- **language-neutral** — facts (dated information, alternative accepted answers, ambiguity, spelling variants that exist in both languages like „Kendō“) → faithful translations in BOTH `notes_en` and `notes_de`.
- Mixed notes are split. If proofreading made a note obsolete (you fixed the misprint in the article), keep a player-facing note only if it still helps.
Then set `"enriched": true` on the set.

## Writing files
Python only: `d = json.load(open(p))` … `json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)` then append `"\n"`. Save after every set (resumable). Question objects must end with exactly the keys `original, de, en, answer_de, answer_en, timeline, source`.

## Card report — `~/Downloads/quiz-cards/enrich-report/<stem>.md`
```
# cNNN <stem>

## Q/A changes
- s03q2: answer_en: "old" → "new" — why — url      (or "none")

## Low-confidence events
- s07q4: why the event/precision is uncertain      (or "none")

## Notes reclassified
- s05: internal / de-only / both — one line        (or "none")
```

## Done = both checks pass
```
python3 ~/Downloads/quiz-cards/tools/enrich_check.py cNNN …
python3 ~/Downloads/quiz-cards/tools/check_urls.py cNNN …
```
`check_urls` WARN (403/429 bot-blocking) is acceptable only after you confirmed the page with WebFetch; FAIL is never acceptable.
