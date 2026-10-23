# Worker instructions — one photographed German trivia card

You are processing ONE photographed German trivia card. Everything stays local:
**do NOT touch the git repo, do NOT commit, push, or open PRs. Do not use the Agent tool.**
Your prompt gives you `STEM` (e.g. `IMG20260910164837`). Derived paths:

- Image:      `/home/mantas/Downloads/Photos-1-001 (2)/<STEM>.jpg`
- Work dir:   `/tmp/claude-1000/-home-mantas-Documents-Projects-Personal-BoardGames/d8719ed2-f297-4746-91b9-39eee6125dc3/scratchpad/cards/<STEM>/`
- Output:     `/home/mantas/Downloads/quiz-cards/json/<STEM>.json`
- Self-check: `python3 /tmp/claude-1000/-home-mantas-Documents-Projects-Personal-BoardGames/d8719ed2-f297-4746-91b9-39eee6125dc3/scratchpad/check_card.py /home/mantas/Downloads/quiz-cards/json/<STEM>.json`

## 1. Rotate 90° left and read (your own vision is the OCR — there is no tesseract)

```bash
W="/tmp/claude-1000/-home-mantas-Documents-Projects-Personal-BoardGames/d8719ed2-f297-4746-91b9-39eee6125dc3/scratchpad/cards/<STEM>"; mkdir -p "$W"
magick "/home/mantas/Downloads/Photos-1-001 (2)/<STEM>.jpg" -rotate -90 "$W/rot.jpg"
H=$(identify -format %h "$W/rot.jpg"); WD=$(identify -format %w "$W/rot.jpg")
magick "$W/rot.jpg" -crop ${WD}x$((H*40/100))+0+0             +repage "$W/band1.jpg"
magick "$W/rot.jpg" -crop ${WD}x$((H*40/100))+0+$((H*30/100)) +repage "$W/band2.jpg"
magick "$W/rot.jpg" -crop ${WD}x$((H*40/100))+0+$((H*60/100)) +repage "$W/band3.jpg"
```

View `rot.jpg` with the Read tool (text must now read left-to-right; if it is upside down,
redo with `-rotate 90`). Then view `band1.jpg`, `band2.jpg`, `band3.jpg` — they overlap, and
each band of the card is fully inside at least one of them — to confirm every umlaut, name,
number and quotation mark. Transcribe the 12 German questions **verbatim** (join hyphenated
line breaks like "Bundes-/republik" → "Bundesrepublik"; keep „…" quotes; keep the trailing ? — or the
trailing . if the card phrases it as an imperative such as "Nenne drei …"; never alter it).

## 2. Layout → categories (position decides)

After rotation there are three horizontal colour bands: **pink (top), blue (middle), sand
(bottom)**. Each band has a circle with 4 icons in the middle, **TWO questions stacked to its
LEFT and TWO stacked to its RIGHT**. The icon quadrant is the question quadrant. Number the
sets TL, TR, BL, BR within each band, top band first:

| Band | TL | TR | BL | BR |
|---|---|---|---|---|
| Pink | 1 Stage & Music (♪ note) | 2 Language & Literature (book) | 3 Art & Architecture (compass/pencil) | 4 Film & TV (clapperboard) |
| Blue | 5 Sport & Games (ball) | 6 History & Society (scroll) | 7 Business & Politics (handshake) | 8 Religion & Philosophy (yin-yang) |
| Sand | 9 Medicine & Science (flask) | 10 Earth & Space (globe) | 11 Flora & Fauna (leaf) | 12 Computers & Technology (cursor) |

Category names must be EXACTLY these (the check script compares them):

| n | category_en | category_de |
|---|---|---|
| 1 | Stage & Music | Bühne & Musik |
| 2 | Language & Literature | Sprache & Literatur |
| 3 | Art & Architecture | Kunst & Architektur |
| 4 | Film & TV | Film & Fernsehen |
| 5 | Sport & Games | Sport & Spiel |
| 6 | History & Society | Geschichte & Gesellschaft |
| 7 | Business & Politics | Wirtschaft & Politik |
| 8 | Religion & Philosophy | Religion & Philosophie |
| 9 | Medicine & Science | Medizin & Wissenschaft |
| 10 | Earth & Space | Erde & Weltall |
| 11 | Flora & Fauna | Flora & Fauna |
| 12 | Computers & Technology | Computer & Technik |

Position decides the category. If the content seems to contradict the position, keep the
position and explain in that set's `notes`.

## 3. Translate each original question to English

Faithful and natural; keep proper nouns, titles and quoted names (add the customary English
title after a German work title only if it helps, e.g. „Der nasse Fisch" stays as is).

## 4. Four sibling questions per original

Same sub-topic AND same question form as the original. "Which element…" → four more
which-element questions; "Who wrote…" → four more who-wrote questions about closely related
works/authors; "Between which countries was the Hundred Years' War fought" → four more
between-which-countries/which-war questions from the same era or theme. Same difficulty as the
original, unambiguous, exactly one canonical, verifiable answer each. The five answers within a
set must all be different. Write every sibling in German AND English (same question in both).

## 5. Answers for all five (DE + EN)

Short and canonical: "Bertolt Brecht", "42", "Schloss Schönbrunn" / "Schönbrunn Palace",
"England und Frankreich" / "England and France". Years and numbers as digits. Correctness is
the whole point: if you are not sure of a sibling's answer, replace the sibling with one you
are sure about. Use the German answer form the way it would appear in running German text
(nominative, so it can be quoted verbatim in the article).

## 6. One article per set (EN, then DE)

~350–500 words in **English** (about one A4 page) that covers the set's sub-topic and
naturally contains **all five `answer_en` strings verbatim** (same casing and inflection; a
table or list is welcome where it fits — elements, discographies, timelines, rulers, records).
Then **translate that article into German** (same article, not a new one) so that it contains
**all five `answer_de` strings verbatim**. Give each version a title. Markdown inside the
article strings is fine (paragraphs separated by `\n\n`, tables, bullet lists).

## 7. Write the JSON, self-check, fix

Write `/home/mantas/Downloads/quiz-cards/json/<STEM>.json` with the Write tool, exactly this
shape (valid JSON — escape `"` and use `\n` inside strings):

```json
{
  "image": "<STEM>.jpg",
  "sets": [
    {
      "n": 1,
      "category_en": "Stage & Music",
      "category_de": "Bühne & Musik",
      "questions": [
        { "original": true,  "de": "<verbatim card text>", "en": "<translation>", "answer_de": "…", "answer_en": "…" },
        { "original": false, "de": "…", "en": "…", "answer_de": "…", "answer_en": "…" },
        { "original": false, "de": "…", "en": "…", "answer_de": "…", "answer_en": "…" },
        { "original": false, "de": "…", "en": "…", "answer_de": "…", "answer_en": "…" },
        { "original": false, "de": "…", "en": "…", "answer_de": "…", "answer_en": "…" }
      ],
      "article_title_en": "…",
      "article_en": "…",
      "article_title_de": "…",
      "article_de": "…",
      "notes": ""
    }
  ]
}
```

`sets` has exactly 12 entries, `n` = 1..12 in the category order above; `questions` has exactly
5 entries with the original first. Then run the self-check command and fix the file until it
prints `PASS`. The check enforces: valid JSON, 12 sets in canonical order with exact category
names, 5 questions each (original first), all fields non-empty, every question ends with `?`, `.` or `!` (a closing quote after it is fine — keep exactly the card's punctuation and order, never add or move anything),
each `answer_en` found in `article_en` and each `answer_de` in `article_de` (case-insensitive,
whitespace-normalised, otherwise verbatim), distinct answers within a set, articles 250–800 words.

Finally re-read `band1/2/3.jpg` once more and compare against the 12 `original: true` `de`
strings character by character; fix any transcription slip and re-run the check.

## Report

End your final message with exactly these two lines and nothing after them:

```
OUTPUT: /home/mantas/Downloads/quiz-cards/json/<STEM>.json
CHECK: PASS
```

(or `CHECK: FAIL — <reason>` if you could not get the check to pass.)
