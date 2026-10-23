# Quiz evidence crawler

Fills in the machine half of the evidence ledgers (`packages/core/src/quiz/content/evidence/aNNNN.json`,
schema in `core/quiz/evidence-types.ts`). For every source a ledger cites it does four things:

1. fetches the page and stores its readable text as a snapshot,
2. saves a Wayback Machine copy,
3. marks mirrors and near-copies as clones,
4. checks whether each fact's answer, and each agent's quote, really appears on the page.

The crawler never creates a ledger. The backfill (`pnpm quiz-evidence backfill`, below) turns `fact.source`, history sources, transcript
sources and hand-check verdicts into ledgers first; the crawler only works on files that already exist.

```bash
pnpm quiz-evidence backfill [--articles=…] [--dry-run]                 # seed ledgers from what the bank cites
pnpm quiz-evidence crawl  [--articles=a0001,a0002] [--limit=N] [--concurrency=4] [--resume] [--no-wayback] [--dry-run] [--run=<id>]
pnpm quiz-evidence verify [--articles=…] [--dry-run] [--run=<id>]      # clones + quote checks + answer checks
pnpm quiz-evidence clones [--articles=…] [--dry-run]                   # clone marking on its own
pnpm quiz-evidence report [--articles=…]                               # counts + grade distribution
```

Every command also takes these flags:

- `--content-dir=<dir>`: a folder holding `articles/` and `evidence/`. It defaults to the bank.
  Point it at a scratch copy to try things out.
- `--snapshot-dir=<dir>`: defaults to `packages/quiz-archive/snapshots`.
- `--state=<file>`: defaults to `scratch/quiz-evidence/crawl-state.json`.

`--run` defaults to `crawl-YYYY-MM-DD` and is stamped on every assessment the crawler writes.

## Backfill

`backfill.ts` creates or extends `evidence/aNNNN.json` for every active article. It is append-only and
idempotent: a re-run adds only sources and assessments that are missing, with ids continuing the file's
own (`s<max+1>`, `e<max+1>`) and `at` never earlier than the file's last assessment.

- **Sources**, deduplicated per article by normalised URL (https, no fragment, no `utm_*`/`fbclid`/…
  params; a Wikipedia title cut off before its `)` gets it back):
  - each active fact's `source`;
  - every URL in the article's history entries' `sources`, credited to the fact the entry targets (a
    wording's entry → its fact). Article-level entries add their source without crediting a fact;
  - the transcript source of each printed wording (`quiz-archive/transcripts/<source>/<card>.json`;
    Quiztopia: the set's original question);
  - the hand check's sources (`quiz-archive/runs/handcheck-2026-10-23/out/u*.verdicts.json`).
  - `kind` comes from the host (`inferKind`): Wikipedia & co → encyclopedia; Britannica, dictionaries,
    SEP → reference; .gov/.gv.at/bund.de/europa.eu/who.int/… and museums → official; doi.org, journals,
    .edu/.ac.xx → scholarly; news outlets → press; fandom & fan sites → fan; else other. `lang` is the
    citation's, else from the host. `retrievedAt` is the date the bank first cited it (the crawler
    overwrites it with the fetch time).
- **Assessments:**
  - one seed per (fact, source): `claim: answer`, `verdict: unverified`, `confidence: low`,
    `by: backfill`, run `evidence-backfill-2026-10-23`, note `backfill: cited by fact source; history
    entry seq N; transcript tp-032`. Its support is the fact's answer in the source's language with
    `verbatim: false` — the crawler's own form for an answer not yet found. That support is what makes
    the crawler's answer check look at every cited source, not only `fact.source`; a seeded fact grades D
    until the crawler finds its answer.
  - hand-check verdicts (the latest per card ref; later units win) become real assessments,
    `by: handcheck-research`, run `handcheck-2026-10-23`, note = the worker's `why`: `confirmed` and
    `fixed` → confirmed (note `after fix …`); `contested` → contested, unless the worker resolved it in
    the bank (`changes` non-empty: narrowed the question, accepted alternatives) — then confirmed at
    medium confidence, since the contest was the card's, not the bank's answer. Support lists each of
    its sources (answer quote, `verbatim: false`); those (fact, source) pairs get no seed.
    `needs-placement` items are skipped.

## Lanes

`crawl` runs two lanes at once. A slow archive never holds up fetching.

- **Fetch lane.** `--concurrency` workers (4 by default) handle every source without a `snapshot`.
  - **Wikipedia** (`<lang>.wikipedia.org/wiki/…` or `…/w/index.php?title=`, mobile hosts
    included) goes through the plain-text extract API: `action=query&prop=extracts&explaintext=1&redirects=1`. It is one cheap
    JSON call, with no HTML to parse and redirects resolved. The snapshot is the page title, a blank line,
    then the extract. Infoboxes and tables are not part of an extract.
  - **Other pages:** the HTML is fetched, redirects are followed, and the text is extracted by `extractText` (`lib.ts`):
    - scripts, styles, nav, header, footer, aside and forms are dropped;
    - `<article>` is kept if present, else `<main>`, else `<body>`;
    - block elements become lines and entities are decoded.

    `text/plain` is taken as it is. PDFs, images and other binaries fail as `unsupported-type`.
    So do pages with under 50 characters of text (`empty-text`).
  - **Saving a fetch:**
    - the text is gzipped to `snapshots/<sha256-of-text>.txt.gz`, deduplicated by hash;
    - every ledger source with that URL gets `snapshot` and `retrievedAt` (the time of the fetch);
    - the final URL after redirects is kept in the state file. The ledger keeps the URL that was cited.
- **Wayback lane.** It runs one request at a time over every source without an `archiveUrl` (skip it with `--no-wayback`).
  - It first calls anonymous Save Page Now (`GET https://web.archive.org/save/<url>`), at most once every 15 s, with a 120 s timeout.
  - If that fails, it asks the availability API (`archive.org/wayback/available?url=`) and takes the closest existing capture.
  - The result goes to `archiveUrl`. The state file records whether it came from `save` or `closest`.

## Politeness

- **User agent:** `BoardGamesQuizEvidence/1.0 (private quiz trainer; contact quiz-content-check@users.noreply.local)`.
  It is sent as `User-Agent`, and as `Api-User-Agent` for Wikimedia.
- **IPv4 first:** `dns.setDefaultResultOrder("ipv4first")`, with family auto-selection off.
- **Rate limit:** about 1 request per second per host, across all workers. SPN has its own 15 s lane.
- **Back-off on 429 / 503:** the crawler honours `Retry-After`, in seconds or as an HTTP date.
  - Without the header, it waits 5 s, 10 s, then 20 s, capped at 2 min, and the wait pushes that host's next slot out.
  - It gives up after 3 retries.
  - A network error or timeout (30 s) is retried once.
- **Size cap:** bodies stop at 10 MB (`too-large`).
- **No bank-wide runs from a laptop session by accident:** try `--dry-run` (it lists what would
  be fetched or archived and makes no requests) and `--limit` first.

## Resuming

- **What is already done:** a source that has a `snapshot` is never fetched again, and one that has an `archiveUrl` is never archived again. Re-running `crawl` therefore continues where the last run stopped.
- **The state file:** it records the outcome of every URL: status, reason (`http-404`, `http-403`,
  `timeout`, `network-…`, `wiki-missing`, `unsupported-type`, `empty-text`, `too-large`, `no-archive`), final URL, attempts and time.
  - It lives outside `content/`, and outside the LFS-tracked snapshots folder.
  - It is saved after every URL, and on Ctrl-C.
- **Without `--resume`:** failed URLs are tried again.
- **With `--resume`:** a URL the state file has already attempted is skipped, per lane. This is the way to continue a long crawl without retrying dead links each time.
- **Safe writes:** ledgers are written atomically (temp file + rename) under a per-article lock, as
  indent-1 JSON with a trailing newline.
  - Each write must still parse, pass `evidenceProblems`, and leave every existing assessment byte-identical. Otherwise nothing is written.
  - Fields the crawler doesn't know about are kept.

## Verify: what gets appended

`verify` reads the snapshots. A snapshot that is only an LFS pointer counts as missing.
It never edits an assessment. It only appends new ones, each with `by: "crawler"` and the run id.

- **Clones** (`detectClones`). These rules set `cloneOf` only on a source that doesn't have it yet:
  - A host on `CLONE_DOMAINS` (`grade.ts`: wikiwand, dbpedia, academic mirrors, wikidata …) gets the site it copies, e.g. `wikipedia.org`.
  - A page can share ≥ 60 % of its 8-word shingles (Jaccard) with a source of another domain family. It is then marked a clone of the more authoritative of the two. That means the earlier one by kind (primary > official > scholarly > reference > encyclopedia > book > press > fan > other), then by id.
  - Pages with fewer than 50 shingles are never compared, so error pages and stubs don't match each other.
- **Quote checks.** A person's or agent's decisive assessment may carry a quote without `verifiedAt`.
  - If that quote is on the source's snapshot (whitespace and typographic quotes and dashes normalised), the crawler appends a copy: same target, claim, verdict and confidence, with `verifiedAt`.
  - The note starts `quote check:`.
  - Only the latest assessment for that target, claim and source is checked, so an older judgement is never revived.
- **Answer checks.** For each active fact, the crawler checks each source that speaks to it: the sources its assessments cite, plus the source whose URL is the fact's `source.url`.
  - **What it searches for:** the answer in the page's language first (`answerEn` / `answerDe` / `answerRu`), then the other languages' answers.
  - **How it matches:** whole words only, after folding both the answer and the text:
    - case and diacritics (é → e, й → и, ß → ss);
    - hyphens, dashes and spaces treated alike;
    - number formats (`1,000` = `1.000` = `1 000` = `1000`);
    - quote marks.
  - **When found:** the assessment is `confirmed`, `confidence: medium`, with the sentence around the
    first occurrence that sits in real prose (≤ 300 chars, verbatim from the snapshot) as a
    `verbatim: true` quote with `verifiedAt`.
  - **When not found:** the assessment is `unverified`, and the quote is the answer it searched for (`verbatim: false`). The note starts `answer check:`.
  - **When nothing is appended:**
    - the result is the same as the crawler's last answer check for that fact and source (same verdict and quote), which makes re-runs idempotent;
    - it disagrees with a decisive (not `unverified`) judgement by a person or agent on that source. A machine never overrules a human;
    - the fact is contested (`factGrade(...).contested`). A contest needs a person.

## How grades move

Grades are computed by `core/quiz/grade.ts` and never set by hand. These are the grade changes the crawler causes:

- **D → C:** a fact whose only source had no snapshot, or no verified quote, reaches C once its answer is found verbatim on that page.
- **C → B / A:** when a second **independent** source also confirms the answer, the fact rises to B. It reaches A if one of the sources is primary, official or scholarly and every source is verified.
  - All Wikipedia language editions and their mirrors are ONE family.
  - So are all pages of one site.
  - So is a page marked `cloneOf`.
- **Verified agent quotes:** quotes that agents stored count as verbatim-verified once their source has a snapshot or a quote check gave them `verifiedAt`.
- **What doesn't change a grade:** an `unverified` crawler check never confirms anything. It also doesn't override an agent's confirmation on the same source.
- **Report:** `report` prints the counts and the grade distribution over the active facts. Facts without a ledger count as E.

## Tests

The pure parts live in `lib.ts`: extraction, matching, shingles and clones, and the assessment planner. Their unit tests are in `lib.test.ts`. They make no network calls.

```bash
pnpm exec vitest run --config scripts/quiz-evidence/vitest.config.ts
pnpm exec tsc -p scripts/quiz-evidence/tsconfig.json
```
