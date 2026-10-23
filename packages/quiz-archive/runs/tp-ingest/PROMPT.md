Follow /var/home/mantas/Documents/Projects/Personal/BoardGames/scripts/quiz-ingest/TRANSCRIBE.md exactly (read it in full first, and read packages/core/src/quiz/sources.ts and packages/core/src/quiz/taxonomy.ts in that repo).

WORK=/var/home/mantas/Downloads/quiz-cards/trivial-pursuit
SOURCE=trivial-pursuit
Repo root (run pnpm commands there): /var/home/mantas/Documents/Projects/Personal/BoardGames

Your cards (card id = photo):
CARDS

Rules: never touch git, never edit repo files, never use the Agent tool; only write $WORK/printed/<card>.json for YOUR cards and keep ALL your helper scripts and temp files in $WORK/scratch/<card>/ (never in the session scratchpad or /tmp — other workers share those). No yes/no, true/false or multiple-choice questions survive — rework them into open questions (reworked: true) and research every answer on a page you fetched. In this shell `grep` is a broken wrapper — use `command grep` or Python. Write the JSON with Python in pieces if it is long. Finish with one `OUTPUT: … CHECK: PASS|FAIL — reason` line per card.
