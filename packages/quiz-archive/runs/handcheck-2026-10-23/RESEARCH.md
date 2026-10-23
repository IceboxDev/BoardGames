# Worker brief: settle answer-side doubts on printed quiz cards (deep research)

The quiz bank (`/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/content/`) holds the questions of three printed games: Trivial Pursuit (`tp-NNN`, German, 6 slots: 1 Geo, 2 Entertainment, 3 History, 4 Art & Literature, 5 Science, 6 Sport), Publish or Perish (`pp-NNN`, English multiple choice, 2 slots) and its MGE expansion (`ppm-NNN`). A hand check flagged items where we are UNSURE OF THE ANSWER. Your job: research each one until you are no longer unsure, then make the bank right.

**The card's own answer is NOT a source of truth.** TP card backs were never photographed (every TP answer was researched); PoP/MGE print an answer letter and explanation on the card (inside `cardText`), but cards are often wrong. Truth comes only from independent, reputable sources you actually fetch (WebSearch / WebFetch / curl -4): primary sources, encyclopaedias, official bodies, peer-reviewed papers. Use at least two independent sources per item; keep digging (other languages, original papers, official data) while sources disagree. Never invent a URL.

## Your input

`/var/home/mantas/Downloads/quiz-cards/handcheck/out/<unit>.items.json`: `articles` (the article files you OWN) and `items`, each `{ref: "tp-145/6", wording, article, fact, photo, note}`. `note` says what is doubted. The card's printed words: `printed.card`/`cardText` of the wording, and `/var/home/mantas/Downloads/quiz-cards/{trivial-pursuit,publish-or-perish,publish-or-perish-mge}/printed/<card>.json` (questions are in slot order; `cardDe`/`cardText` is the printed question, `notes` hold the transcriber's doubts). Grep `/var/home/mantas/Downloads/quiz-cards/*/enrich-notes.md` and `.../errata.md` for your card refs for earlier reasoning.

Item kinds:
- **Uncertain / presumed answer:** find the true answer to the CARD'S question (as printed). If the bank's answer is wrong or incomplete, fix it.
- **"true/false judged FALSE: verify":** the TP card is a true/false statement; the bank reworked it into an open question whose answer implies the statement is false. Verify the statement really is false and the open question + answer are right. If the statement is actually TRUE, rework the fact accordingly.
- **Outdated:** the answer must be correct today (2026-10); say "as of" in the body if it changes over time.
- **Merge asks a different question / "which is NOT" cards:** the printed wording must ask the CARD'S question (as an open question, no multiple choice) and its fact's answer must be the true answer to that question. If the fact the wording sits on asks something else: when that fact has OTHER wordings, move this printed wording to a NEW fact (ids from your range) with its own answer, spans, timeline and source, and leave the old fact with its other wordings; when the printed wording is the fact's only wording, correct the fact in place. Never exceed 8 active facts per article: if a new fact would make 9, do NOT add it; record `needs-placement` in your verdicts with the full proposed fact (de/en/ru wording, answers, source) and leave the article unchanged for that item.
- **PoP/MGE card errors:** confirm the correct answer. Our wording should be an open question with the correct answer; a wrong card premise is corrected (card words stay in `cardText`), an ambiguous one narrowed so exactly one answer is right, alternatives that also count go in the notes.

If, after real effort, the truth is genuinely contested among good sources, make the question unambiguous (narrow the wording to what is settled) or record accepted alternatives in the notes, and say so in your verdict (`contested`).

## Editing rules (follow `/var/home/mantas/Documents/Projects/Personal/BoardGames/scripts/quiz-ingest/ENRICH.md` conventions)

- Edit ONLY your own article files. **Do NOT touch git, any other repo file, or use the Agent tool; never `pkill`/`kill` by pattern.** Other workers edit other articles at the same time. Scratch scripts in `/var/home/mantas/Downloads/quiz-cards/handcheck/scratch-<unit>/`; run python with `-I`.
- Read `packages/core/src/quiz/content-types.ts` first, and each article in full before changing it.
- A fix that changes an answer updates `answerEn/De/Ru`, both/all bodies (`bodyEn/De/Ru`, each answer in the sentence that gives it), `spans` (Python str indices, `[start, len]`, never in a table row/heading/inside a longer word), `source`, `timeline` (with `labelRu`), and notes if relevant — in all three languages.
- Wordings are open questions only (no yes/no, true/false, multiple choice). A printed wording keeps the card's literal words in `cardText` (never remove or change an existing `cardText`); `de`/`en`/`ru` are the open question.
- Never change or reuse ids, never delete facts or wordings (a fact leaves play only via the article's `retired` list `{at, reason, replacedBy?}`). New facts/wordings use ONLY your id range (in your prompt), counting up.
- Save atomically: `json.dump(a, f, ensure_ascii=False, indent=1)` + final newline to `articles/.<id>.json.tmp`, then `os.replace`.
- When nothing is wrong, change nothing.
- Check from the repo root: `timeout 300 pnpm -s quiz-ingest check-bank --complete <your changed article ids…>` → 0 problems for your articles.

## Output

1. `/var/home/mantas/Downloads/quiz-cards/handcheck/out/<unit>.verdicts.json`: a list, one per item:
   `{"ref", "article", "fact", "verdict": "confirmed"|"fixed"|"contested"|"needs-placement", "confidence": "high"|"medium", "answer": "<true answer, short>", "why": "<one or two sentences for the owner>", "sources": ["url", …], "changes": "<what you changed, or ''>", "proposedFact"?: {…}}`.
   Do not finish while any item would be "low" confidence — research more.
2. `/var/home/mantas/Downloads/quiz-cards/handcheck/out/<unit>.reasons.json`: one key per changed entity (wording fields → wording id; fact fields such as answers/spans/timeline/source/notes of a fact → fact id; article fields such as bodies/notes/title → article id) → `{"kind": "corrected"|"errata"|"reworded"|"created"|"translated"|"marked"|"edited", "reason": "...", "sources": [{"url": "..."}], "fields": ["..."]}` (or a list split by fields). Reasons are for a reader who wasn't there: what was wrong and why the new text is right. A new fact → `created`. Do not run `quiz-ingest log`.

End your final message with: `DONE: <n> items · fixed <n> · confirmed <n> · contested <n> · needs-placement <n> · CHECK: PASS|FAIL`.
