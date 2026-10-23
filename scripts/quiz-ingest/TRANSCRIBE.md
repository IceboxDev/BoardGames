# Worker instructions — transcribe photographed quiz cards

You process one or more photographed cards of a quiz game (your prompt lists them: photo path +
card id). Everything stays local: **do NOT touch git (no commit/push/branch/PR), do NOT use the
Agent tool, do NOT edit any file in the repo.** You only write your own output files.

Your prompt gives `WORK` (the source's work folder) and `SOURCE`. Per card:
- Output: `$WORK/printed/<card>.json`
- Scratch: `$WORK/scratch/<card>/` (your own folder — never touch another card's)

## 1. Read the card (your own vision is the OCR — there is no tesseract)

Card layout and categories of `SOURCE`: `packages/core/src/quiz/sources.ts` (`layout`,
`categories`, `questionsPerCard`) — read it first.

**Trivial Pursuit (this run):** the photo is portrait with the card's text running sideways. Six
questions, each beside a coloured wedge, in this fixed order (top to bottom once rotated):
1 blue = Geography, 2 pink = Entertainment, 3 yellow = History, 4 purple = Art & Literature,
5 green = Science & Nature, 6 orange = Sports & Leisure. The card number is printed in the corner
— it must equal the number in your card id (`tp-021` = 21); if it doesn't, stop and report.
Answers are NOT on the photo (they are on the card's back) — you research them (step 2).

```bash
S="$WORK/scratch/$CARD"; mkdir -p "$S"
magick "$PHOTO" -rotate 90 "$S/rot.jpg"           # text must read left-to-right; else -rotate -90
H=$(identify -format %h "$S/rot.jpg"); W=$(identify -format %w "$S/rot.jpg")
magick "$S/rot.jpg" -crop ${W}x$((H*40/100))+0+0             +repage "$S/band1.jpg"
magick "$S/rot.jpg" -crop ${W}x$((H*40/100))+0+$((H*30/100)) +repage "$S/band2.jpg"
magick "$S/rot.jpg" -crop ${W}x$((H*40/100))+0+$((H*60/100)) +repage "$S/band3.jpg"
```

View the full card and every crop with the Read tool to confirm each umlaut, name, number,
italics and quotation mark. Transcribe each question **verbatim** into `cardDe` (join hyphenated
line breaks; keep „…" quotes; keep the card's punctuation; bold words like **nicht** / **kein**
are plain text — but notice them, they flip the meaning).

**Publish or Perish (English cards):** the base game's photos are upside down — `magick "$PHOTO"
-rotate 180 "$S/rot.jpg"`; the Midterm Grading Extravaganza expansion (`publish-or-perish-mge`,
cards `ppm-NNN`) is photographed upright — no rotation. Then crop the upper and lower halves. One face holds **two questions** (category
1 = the upper one, 2 = the lower one; if a face shows a different number, stop and report). Each
is `[Discipline] question`, options A/B/C (sometimes on one line), `Answer: X.` and an
explanation. Put **everything the card prints for that question** verbatim into `cardText`
(`[Discipline] question` / each option on its own line / the answer line with its explanation),
the discipline alone into `discipline` ("Botany"), and leave `cardDe` out. Every one of these is
multiple choice → `reworked: true`: write the OPEN question in English as `en` (it may use the
explanation to make the question unambiguous — "For which instrument did Francisco Tárrega
compose the Gran Vals, the melody of the original Nokia ringtone?"), translate it to German as
`de`, and answer it in both languages. The card's answer is a claim, not proof: verify it on a
fetched page; when the card or its explanation is wrong or dated, ask the true fact and say so in
`notes`. A "which of the following …" whose answer only makes sense among the options → ask the
underlying fact the explanation gives.

## 2. Make it an open question, then answer it

**No yes/no, true/false or multiple-choice questions are allowed.** If the card asks "…, richtig
oder falsch?", "Ja oder nein?", or offers options ("…: RTL, ProSieben oder Kabel eins?", "…: Sepp
Maier oder Rudi Kargus?"), rework it into an OPEN question about the underlying fact and set
`reworked: true`:
- „Siamkatzen haben meist blaue Augen. Richtig oder falsch?" → „Welche Augenfarbe haben Siamkatzen meist?"
- „Der Erfinder der Blindenschrift, Louis Braille, war selbst blind. Richtig oder falsch?" → „Wodurch erblindete Louis Braille, der Erfinder der Blindenschrift?" (or another open question on the same fact)
- „Welcher Privatsender sendete erstmals am 2. Januar 1984 vom luxemburgischen Dudelange aus: RTL, ProSieben oder Kabel eins?" → „Welcher Privatsender sendete erstmals am 2. Januar 1984 vom luxemburgischen Dudelange aus?"
- A "which of these is NOT …" question → ask the positive fact it hinges on.

Keep the reworked question as close to the card's topic and wording as possible, unambiguous, with
exactly one short verifiable answer. Otherwise `de` = `cardDe` and `reworked: false`.

**Research the answer** — never guess. Confirm it on a page you actually fetched (WebFetch, or
`curl -s -A QuizContentCheck/1.0 "https://de.wikipedia.org/api/rest_v1/page/summary/<Title>"`,
or raw wikitext `…/w/index.php?title=<Title>&action=raw`). That page is the question's `source`.
- `answerDe` / `answerEn`: short and canonical ("Bertolt Brecht", "42", "Mumbai"); German in the
  nominative, as it would be quoted in running text. Numbers as digits.
- `en`: a faithful, natural English translation of `de` (the open question).
- Dated premise, several accepted answers, a card that is wrong → keep it honest and say so in `notes`.

## 3. Timeline, source, place

- `timeline`: the single most relevant datable thing for the question/answer pair —
  1. the dated thing the question is about (publication, premiere, battle, treaty, founding, discovery, record …);
  2. the answer is a person → their lifespan (`kind: "lifespan"`; living: `end: null, ongoing: true`);
  3. a war, reign, era → its interval;
  4. a thing with no date of its own → when it was discovered / named / first described, at honest precision.
  Shape `{ kind, start, end, precision, approx, ongoing, labelEn, labelDe }`; kind one of
  event|lifespan|period|reign|creation|founding|discovery|era; `start`/`end` "YYYY" | "YYYY-MM" |
  "YYYY-MM-DD" (BC = minus, no year 0, deep time "-66000000"); precision
  day|month|year|decade|century|millennium|megayear and it MUST match `start` (YYYY-MM-DD → day,
  YYYY-MM → month); labels ≤ 140 chars, readable without the question, same fact in both
  languages. Day/month precision only when verified.
- `source`: `{ url, title, lang }` — the fetched page that confirms the answer. NEVER an invented URL.
- `domain` + `sub`: where the fact belongs in `packages/core/src/quiz/taxonomy.ts` (judge by the
  fact, not the wedge colour: a "Sports & Leisure" question about chess openings is
  `sport-games/games`; a "Science & Nature" question about a cat breed is `nature/mammals`).

## 4. Write and check

```json
{
  "source": "trivial-pursuit",
  "card": "tp-021",
  "image": "IMG20261007173323.jpg",
  "questions": [
    { "category": 1, "cardDe": "…verbatim…", "de": "…open question…", "en": "…", "reworked": false,
      "answerDe": "…", "answerEn": "…", "timeline": { … }, "source": { … }, "notes": "",
      "domain": "geography", "sub": "cities" }
  ]
}
```

Six questions (Trivial Pursuit) or two (Publish or Perish), categories in order. Write with Python (`json.dump(…, ensure_ascii=False,
indent=1)`), then run from the repo root
`pnpm -s quiz-ingest check $WORK <card> [<card>…]` (your cards only) until it passes. Re-read the crops once more and compare each `cardDe` against the card character by
character.

## Report

End your final message with one line per card and nothing after them:

```
OUTPUT: <WORK>/printed/<card>.json CHECK: PASS
```
(or `CHECK: FAIL — <reason>`).
