# Worker brief: bring close seconds and disputes from the notes into the article text

Owner's rule: "if there's a close 2nd for an answer I would expect the article to mention that." Every reader reads the article body; the notes are small editor's notes. Your input (`alternatives/<batch>.json`) lists articles whose `notesEn` contain sentences naming an alternative answer, a rival figure, a disputed claim or a caveat that the body never mentions.

For each listed note sentence decide:
- **A — substantive** (a rival figure/date/count, a disputed attribution, a competing record holder, a premise that is contested, a scientific caveat that changes how true the answer is): weave it into the body in ALL three languages (bodyEn, bodyDe, bodyRu) as one natural sentence or clause in the paragraph that gives that answer (not appended at the end; tables may get a brief note). Keep the answer sentence clear — the body still states the bank's answer as the main one. Keep the note.
- **B — answer-acceptance only** (spelling variants, synonyms, translations, English/German names, "X also counts" equivalents, grading leniency): leave it in the notes, change nothing.
Verify every A statement against the article's evidence ledger (`content/evidence/<id>.json`) or a page you fetch; never add an unsupported figure.

Rules: repo /var/home/mantas/Documents/Projects/Personal/BoardGames, articles in packages/core/src/quiz/content/articles/; follow scripts/quiz-ingest/ENRICH.md (spans = Python str indices on the sentence giving the answer; recompute spans of every fact whose position shifted; never inside a table row/heading/longer word; answers verbatim in every body). Save atomically (tmp + os.replace, indent=1, ensure_ascii False, trailing newline). Edit only your listed articles. No git, no Agent tool, no pkill by pattern, don't run quiz-ingest log/rebuild/seal. Other workers edit other articles.

Output: `/var/home/mantas/Downloads/quiz-cards/provenance/alternatives/<batch>.reasons.json` — article id → {kind:"edited", reason:"<what was added and why>", fields:["bodyEn","bodyDe","bodyRu"]}; fact ids whose spans moved → {kind:"marked", reason:"Answer mark moved with the added sentence.", fields:["spans"]}. And `<batch>.decisions.json`: [{article, note, decision: "A"|"B", added?: "<EN sentence>"}].
Check: `timeout 600 pnpm -s quiz-ingest check-bank --complete <your changed ids>` (subset "replaced by unknown fact" lines are artefacts; confirm with the full check). End with `DONE: <batch> · A <n> · B <n> · CHECK: PASS|FAIL`.
