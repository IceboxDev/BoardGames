# Worker brief: re-research weak or risky quiz facts until the evidence is solid

Repo `/var/home/mantas/Documents/Projects/Personal/BoardGames`. Quiz bank articles: `packages/core/src/quiz/content/articles/aNNNN.json`; their evidence ledgers: `packages/core/src/quiz/content/evidence/aNNNN.json` (schema `packages/core/src/quiz/evidence-types.ts`, grading `packages/core/src/quiz/grade.ts`). Read `scripts/quiz-ingest/ENRICH.md` (editing conventions) and section 7.4 of `scripts/quiz-ingest/README.md` (`evidence add`).

Your input: `/var/home/mantas/Downloads/quiz-cards/provenance/research/out/<batch>.items.json` — `articles` you OWN, `facts` [{article, fact, domain, grade, risk[]}], and id ranges. Each fact is weak (grade D: the answer was not found verbatim on its cited page — often it sits in an infobox/table the crawler can't read) or risky (`risk:number|superlative|time-sensitive|contested|which-not`) and below grade A.

**The goal per fact:** be sure the answer is TRUE and pin it down with evidence:
1. Read the fact (all wordings, answer, notes, the article sentence) and its ledger (`pnpm -s quiz-ingest evidence show <fNNNNN>`).
2. Research for real: fetch pages (WebFetch / WebSearch / `curl -4 -A 'BoardGamesQuizResearch/1.0 (private quiz trainer; contact quiz-content-check@users.noreply.local)'`). Find **at least two independent reputable sources** (different publishers; Wikipedia counts as ONE family whatever the language; mirrors like wikiwand/dbpedia are not independent). Prefer primary/official/scholarly sources (official bodies, museums, record holders' own sites, peer-reviewed papers, national statistics, the publisher/broadcaster, Britannica/Brockhaus as reference). Never invent a URL; never cite a page you didn't fetch.
3. For each source, copy a **verbatim quote** (an exact substring of the page text, ≤300 chars) that supports the answer, and record it:
   `pnpm -s quiz-ingest evidence add --fact=fNNNNN --url=<url> --title=<title> --publisher=<publisher> --kind=<primary|official|scholarly|reference|encyclopedia|press|book|fan|other> --lang=<xx> --quote="<exact text>" --quote-lang=<xx> --verbatim --verdict=confirmed|contested|refuted --confidence=high|medium|low --by=research-<batch> --run=provenance-research-2026-10-23 [--note="…"]`
   (the crawler later snapshots the page and verifies the quote; a quote that isn't really on the page will fail verification — copy exactly).
   For a grade-D fact whose cited Wikipedia page has the answer only in an infobox/table: still add a quote from the page's prose or another source.
4. **If the bank is wrong, outdated or ambiguous**, fix it like the hand-check did: correct answers (EN/DE/RU), bodies (the sentence that gives the answer, in all three languages), spans, timeline, source, notes; narrow an ambiguous wording; record a `refuted`/`contested` assessment for the wrong claim and `confirmed` ones for the corrected answer. A printed wording keeps the card's words in `cardText`; wordings stay open questions. Never change ids or delete facts. Time-sensitive answers: say "as of <year>" in the body and set the fact's `reviewBy` (YYYY-MM-DD, ~1 year out, or the next known change date). Write each changed entity's reason to your reasons file (keys: article id for body/notes, fact id for answer/spans/timeline/source/notes/reviewBy, wording id for wording fields) → `{kind: "corrected"|"errata"|"reworded"|"marked"|"edited", reason, sources:[{url}], fields:[...]}`.
5. Genuinely contested after real effort → record `contested` with both sides, make the wording unambiguous or list accepted alternatives in notes.

## Rules
- Edit ONLY your own articles' files and their evidence ledgers (the CLI writes the ledger). Do NOT touch git, other files, `backlog.jsonl`, or use the Agent tool; never `pkill`/`kill` by pattern (other workers run beside you — kill only your own PIDs). Scratch: `/var/home/mantas/Downloads/quiz-cards/provenance/research/scratch-<batch>/`; python with `-I`.
- Save articles atomically (tmp + `os.replace`, indent=1, ensure_ascii False, trailing newline).
- Do not run `quiz-ingest log`, `rebuild`, `seal`, or `tag`/`retire` commands (they rewrite the whole bank). `evidence add` and `evidence show` are fine.
- Be efficient but never sloppy: ~40 facts; budget your fetches; reuse a source that covers several facts of one article.

## Output
- `/var/home/mantas/Downloads/quiz-cards/provenance/research/out/<batch>.reasons.json` (only if you changed articles).
- `/var/home/mantas/Downloads/quiz-cards/provenance/research/out/<batch>.verdicts.json`: one per fact `{fact, article, verdict: confirmed|fixed|contested, confidence, answer, sources:[urls], why (one sentence), changes ("" if none)}`.
End with: `DONE: <batch> · facts <n> · confirmed <n> · fixed <n> · contested <n> · CHECK: PASS|FAIL` (CHECK = `timeout 600 pnpm -s quiz-ingest check-bank --complete <your article ids>` has 0 problems).

## Practical notes (added mid-run)
- The session's shared WebSearch quota may run out. If searches fail, fetch candidate pages directly: official sites, the references listed on the Wikipedia article, Wikisource/Gutenberg/Perseus for texts, museum/agency/statistics pages, DuckDuckGo HTML (`curl -4 -s 'https://html.duckduckgo.com/html/?q=<query>'`).
- Avoid sites behind Cloudflare/bot challenges (Britannica, etymonline, timeanddate, Merriam-Webster): the crawler can't snapshot them, so their quotes never verify.
- A subset `check-bank --complete <ids>` may report "replaced by unknown fact" for retired facts pointing into other articles — that is a subset artefact; confirm with the full `check-bank --complete` (no ids) instead.
