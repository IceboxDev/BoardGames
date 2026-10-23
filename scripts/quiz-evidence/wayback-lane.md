# Running the Wayback lane bank-wide

The fetch lane is done for the whole bank: the evidence crawl of 2026-10-23 fetched 13,944 URLs and 268 failed. Only the Wayback lane is still to run.

- It saves every ledger source to the Internet Archive and fills in `archiveUrl`.
- It makes one Save Page Now call at a time, at most one every 15 s.
- The 20-source trial below averaged about 22 s per source.
- About 16,000 sources are left, so the run takes **about 4 days**.
- Run it as a long background job, not inside an interactive session.

## Start it

Start it from the repo root, ideally on ws21 or another machine that stays on:

```bash
mkdir -p scratch/quiz-evidence
nohup pnpm -s quiz-evidence crawl --resume --run=evidence-wayback-$(date +%F) \
  > scratch/quiz-evidence/wayback-$(date +%F).log 2>&1 &
echo $! > scratch/quiz-evidence/wayback.pid
```

- **Why `--resume` and no `--no-wayback`:** `--resume` skips every URL the fetch lane has already tried, whether it succeeded or not. Only the Wayback lane does any work, plus any source added since the last crawl.
- **Stopping it:** `kill $(cat scratch/quiz-evidence/wayback.pid)`, or Ctrl-C. Never `pkill` by pattern. The process saves its state on SIGINT and SIGTERM.
- **Restarting it:** run the same command again. Sources that already have an `archiveUrl` are skipped. With `--resume`, so is every URL whose Wayback outcome is already in `scratch/quiz-evidence/crawl-state.json`. To retry Wayback failures, run once without `--resume`. That also retries the failed fetches (268 URLs, about 5 minutes).
- **Progress:**

  ```bash
  grep -c "wayback save\|wayback closest" scratch/quiz-evidence/wayback-*.log
  pnpm quiz-evidence report
  ```

  `report` prints `wayback ok: N (save …, closest …)` and the failure reasons.
- **Ledger writes:** every archive result is written atomically under a per-article lock, inside the crawler process.
  - Do not run a second crawler or `verify` on the same bank while this job runs. Two processes can race on one ledger file.
  - Backfill and verify can run after the job, or while it is stopped.
  - Edits to articles and history by other tools are safe, because the crawler only writes `content/evidence/`.

## The trial run (2026-10-23)

```bash
pnpm quiz-evidence crawl --resume --limit=20 --run=evidence-wayback-2026-10-23
```

- **Result:** 20 of 20 archived, all via `save` (fresh SPN captures), 0 failures. The run took 7 min 20 s (06:43–06:50 UTC).
- **Where it went:** the sources were the first 20 in ledger order, from a0001 to about a0010. Each now has an `archiveUrl` such as
  `https://web.archive.org/web/20261023064300/https://de.wikipedia.org/wiki/Kinderhymne`.
- **Two quick results:** two captures came back with a timestamp from earlier in the day (`20261023030524`). SPN returns a recent capture instead of a new one when the page was archived a few hours before. These are still valid copies.
- **Log:** `scratch/quiz-evidence/wayback-proof-2026-10-23.log`.

## When SPN pushes back

- **Rate limiting:** anonymous SPN can answer with 429s or "too many captures" during long runs. The crawler backs off, honouring Retry-After and waiting 5 s / 10 s / 20 s up to 2 min. When a save still fails, it falls back to the closest existing capture (`via: closest`).
- **A long stretch of failures:** if `no-archive` failures pile up, stop the job and wait an hour, then restart with `--resume`.
- **Faster runs:** an archive.org account's S3 keys allow authenticated SPN2 with higher limits. The crawler would need an `Authorization: LOW <key>:<secret>` header for that, which it does not send yet.
