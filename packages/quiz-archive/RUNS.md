# Transcripts and runs

This is the part of the quiz archive that records how the questions got into the bank. `transcripts/` holds what each printed card says. `runs/` holds every batch of work done on the bank since: its briefs, its inputs, and the verdicts and reasons it produced. Nothing here is loaded by the app or the build. The photos and their manifest are described in `README.md`.

## `transcripts/<source>/<card>.json`

There is one file per printed card, named by its card id in `packages/core/src/quiz/content/sources/<source>.json`. Every card listed there has a transcript, which `python3 -I scripts/quiz-archive/runs.py check` verifies.

| source | cards | from |
|---|---|---|
| `trivial-pursuit` | 400 (`tp-001`…`tp-400`) | `~/Downloads/quiz-cards/trivial-pursuit/printed/` (399), plus `tp-221/printed/tp-221.json` (that photo came last) |
| `publish-or-perish` | 100 | `~/Downloads/quiz-cards/publish-or-perish/printed/` |
| `publish-or-perish-mge` | 160 | `~/Downloads/quiz-cards/publish-or-perish-mge/printed/` |
| `quiztopia` | 177 (`c001`…`c177`) | ws21 `~/Downloads/quiz-cards/json/IMG*.json` (git HEAD `2f17ea6`); renamed from photo to card id through `sources/quiztopia.json` (`image`) |

How the transcripts were copied:
- The content is verbatim, re-serialised as `indent=1` UTF-8 JSON, and each copy is checked to parse back equal to its source.
- The TP, PoP and MGE files are the transcribers' output. Each holds `cardDe`/`cardText` (the card's own words), the open-question `de`/`en`, the answers, the timeline, the source, `notes` (the transcriber's doubts), `reworked`, and the `domain`/`sub` given at transcription.
- The Quiztopia files are the ws21 state after its enrich and dedupe passes, including `article_*`, `notes`, `notes_internal` and `enriched`. The run `quiztopia-enrich` holds that repo's commit log.
- No `.legacy.json` file exists, on purpose. The old copies in git (`HEAD:packages/core/src/games/quiztopia/content/questions/cNNN.json`) were compared field by field, camelCased, against the transcripts. Every one turned out to be a strict subset, so none was kept. The importer re-checks this through `--legacy`.

## `runs/<run-id>/`

A run is one batch of work: an import, an ingest, an enrich, a research pass, a rebalance and so on. Its folder holds the run's text artefacts, copied byte for byte from the work folder:
- briefs, quotas and items;
- verdicts, reasons (and `.orig`) and moves;
- decisions and candidates;
- enrich reports, errata and state logs.

Left out on purpose:
- `scratch*/` (fetched page text, workers' throwaway scripts);
- `staged/` (bank snapshots);
- images and crops (`num/`, `m*.png`);
- PDFs, `.raw` page dumps, HTML;
- each source's `printed/` folder, which is already in `transcripts/`.

Each folder has a `run.json`:

```
{ id, title, startedAt, endedAt,
  kind: ingest|enrich|research|rebalance|rework|dedupe|split|import,
  by: [who did it — coordinator session, subagents, owner],
  brief: the brief file (in the run folder, or "repo <path>"),
  inputs, outputs, archivedFrom, archivedAt,
  counts: { files, bytes, byExt, …run-specific: cards, historyEntries … },
  notes }
```

The runs archived so far:

| run | kind | what |
|---|---|---|
| `quiztopia-import` | import | Quiztopia's 177 cards transcribed on ws21 (2026-09-10…17), plus the validation report and INDEX |
| `quiztopia-enrich` | enrich | ws21 enrich, URL checks and two dedupe passes (2026-09-24/25), with the per-card reports and `qa_changes.tsv` |
| `tp-ingest` | ingest | Trivial Pursuit: 399 cards transcribed and merged (2026-10-20/21). Holds the queues, prompts, candidates, plans, decisions and `STATE.md` |
| `tp-dedupe` | dedupe | The post-merge dedupe (`DEDUPE.md`, `dedupe-report.md`) |
| `tp-enrich` | enrich | The 233 bank-wide enrich batches after the TP merge, plus `enrich-notes.md` |
| `one-question` | split | One question, one fact: the classify verdicts, splits and reasons |
| `pop-ingest` / `pop-enrich` | ingest / enrich | Publish or Perish: the merge, then enrich and `errata.md` |
| `mge-ingest` / `mge-enrich` | ingest / enrich | The MGE expansion: the merge, then enrich, `errata.md` and `problems.txt` |
| `homebrew-retire` | rework | Homebrew stand-ins retired where a printed card now asks the same question |
| `rebalance-2026-10-22` | rebalance | The 14 categories of 199–200 articles: `RECATEGORISE.md`/`GROUP.md`, the pools, `r*.json`, `placed`, `final*` |
| `handcheck-2026-10-23` | research | Hand-check research: the items, units, the `out/` verdicts, `RESEARCH.md` and `question-side.md` |
| `tp-221` | ingest | The missing TP card 221: its candidates, decisions and reasons |
| `rework-2026-10-23` | rework | The fact-count rework: `REWORK.md`, with quotas, reasons and moves in `out/` |

## `runs/ref-map.json`

History entries (`content/history/aNNNN.json`) carry `ref` strings that are relative to `~/Downloads/quiz-cards` as it was at the time. `ref-map.json` maps each distinct `ref` to a path relative to `packages/quiz-archive/`. A ref that names several files maps to the same number of space-separated paths. The map covers 1,226 distinct refs across 75,967 entries, with 0 unresolved and 0 dangling.

The rules (`_resolve_one` in `runs.py`):
- `printed/tp-N.json`, `quiztopia/cN`, `publish-or-perish[-mge]/<card>` and `trivial-pursuit/tp-221` map to `transcripts/<source>/<card>.json`.
- `enrich-report/…` maps to `runs/tp-enrich/enrich-report/…`. Every bare `enrich-report/` ref is dated 2026-10-21.
- `decisions/…` maps to `runs/tp-ingest/decisions/…`. Every `decisions/` ref is dated 2026-10-20 (the TP merge); the later merges wrote none.
- `dedupe-report.md` maps to `runs/tp-dedupe/dedupe-report.md`, and `handcheck/out` maps to `runs/handcheck-2026-10-23/out`.

The map only describes. It is applied to the history files separately, since `ref` is not part of the entry hash.

## Archiving a new run

```bash
python3 -I scripts/quiz-archive/runs.py run --id <run-id> --kind <kind> \
  --src ~/Downloads/quiz-cards/<work-folder> [--src <file-or-dir>[=<prefix>] …] \
  --title "…" --by "Claude Code coordinator" --by "subagents (…)" --brief BRIEF.md \
  --input "…" --output "…" --notes "…" [--include GLOB …] [--exclude GLOB …] [--meta extra.json]
python3 -I scripts/quiz-archive/runs.py refmap   # after adding history refs that point at the new run
python3 -I scripts/quiz-archive/runs.py check
```

- The default excludes keep a run small: `scratch*`, `staged`, `__pycache__`, `num/`, images, PDFs, `.raw`, HTML. Only text extensions are copied: json, jsonl, md, txt, tsv, py, sh, csv and ids.
- `--update` adds files to an existing run.
- Start and end times default to the source files' mtimes.
- `python3 -I scripts/quiz-archive/runs.py transcripts [--quiztopia DIR] [--legacy REV]` re-imports the transcripts.
- New history `ref`s should point straight at `runs/<run-id>/<file>` or `transcripts/<source>/<card>.json`.

The historical runs were built with one `run` call each. That backfill was a one-off: copy the pattern above when archiving the next batch.
