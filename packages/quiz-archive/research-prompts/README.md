# Research prompts for contested quiz facts

Each file is a self-contained prompt for a deep-research AI. It explains the card, our current answer, why sources disagree, the exact questions to settle and the reply format. Each prompt belongs to an open backlog item (`packages/core/src/quiz/content/backlog.jsonl`, kind `research`), visible in the admin Quiz desk (Backlog tab) and via `pnpm quiz-ingest backlog list --kind=research`.

## Workflow per item
1. Paste the prompt (everything below the marked line) into the research AI.
2. Save its reply as `answers/<bNNNNN>.md`.
3. Hand it to Claude ("apply research answer bNNNNN"), or do it yourself:
   - record each source: `pnpm quiz-ingest evidence add --fact=<fNNNNN> --url=… --kind=… --lang=… --quote="…" --verbatim --verdict=confirmed|contested|refuted --confidence=… --by=<you> --run=<run-id>`
   - edit the article (answer, wording, body sentence in EN/DE/RU, notes) and log it: `pnpm quiz-ingest log --reasons=<file>`
   - close the item: `pnpm quiz-ingest backlog close <bNNNNN> --by-ref=<aNNNN#seq of the history entry>` (or `--wontfix="<reason>"`).
4. Tick it off below.

## Checklist
- [ ] **b00316** · f12504 (a2393) · How many witnesses testified about the birth of James II's son in 1688? → [`b00316-f12504.md`](b00316-f12504.md)
- [ ] **b00326** · f14383 (a2655) · How many Trabant cars were built in total? → [`b00326-f14383.md`](b00326-f14383.md)
- [ ] **b00327** · f14701 (a2696) · How many complete Gutenberg Bibles survive? → [`b00327-f14701.md`](b00327-f14701.md)
- [ ] **b00323** · f13242 (a2497) · How long can a termite queen live? → [`b00323-f13242.md`](b00323-f13242.md)
- [ ] **b00320** · f13224 (a0947) · How many silkworms does it take to make one kimono? → [`b00320-f13224.md`](b00320-f13224.md)
- [ ] **b00318** · f13122 (a1273) · Who put the dog-whistle tone on Sgt. Pepper — McCartney or Lennon? → [`b00318-f13122.md`](b00318-f13122.md)
