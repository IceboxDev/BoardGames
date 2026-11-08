# Chess analysis farm (ws21)

Deep "best move" evaluations for opening trees, by `BEST_MOVE_V1`
(`core/src/games/chess/trainer/eval-policy.ts`). The server queues positions
(`chess_eval_jobs`, migration 0056); this worker claims them, analyses them and
posts results into the shared cache (`chess_position_evals`).

## Files

- `worker.ts`: claim, analyse (`pipeline.ts`), then complete. One job at a time, every thread on it.
- `follow-ups.ts`: after each job the worker queues what it leads to (the opponent position after your best move when it needs padding, your positions after each reply played in your games — read through `GET /api/chess-farm/games`) with `POST /enqueue`, and claims them next (`prefer`, depth first). Stockfish's hash still holds most of their search. `FARM_FOLLOW_UPS=0` turns it off.
- `hash-test.ts`: measures that: a follow-up searched with the parent's hash vs from a cleared one.
- `pipeline.ts`: the BEST_MOVE_V1 steps, in this order:
  1. lichess cloud lookup
  2. ChessDB candidates
  3. Stockfish to the tier depth, plus `searchmoves` for each candidate
  4. Lc0 tie-break
- `calibrate.ts`: Phase 0. Measures nodes-to-depth on real tree positions and lookup coverage, then fits the tier depths to a budget. It writes `policy.json`, which the worker reads.
- `sample-positions.ts`: picks calibration positions from a member's imported games (staging DB).
- `uci.ts`, `lookups.ts`: the UCI process wrapper, and the lichess / ChessDB clients.

## Two machines, one queue

- **ws21** (`FARM_KINDS=user`) searches only your positions: single-PV to depth 50 on every tier (`policy.json`, cap 6× the calibrated median nodes), candidates via `searchmoves`, Lc0 tie-breaks.
- **The AWS fleet** (`aws/`) runs the same worker as ws21: one single-threaded lane per vCPU, both kinds (`FARM_KINDS=user,opp`), deepest line first (`FARM_ORDER=deep`), Lc0 through ws21. Free-plan `c7i-flex.large` instances, at most 8 per account (16-vCPU quota), about $0.095 a machine-hour all in (instance, public IPv4, 8 GB disk).
- **Claim order:** the position most played on lichess first. `chess_eval_jobs.popularity` (migration 0060) is the explorer's game count, every rating and speed, filled in the background by the API server that has `LICHESS_TOKEN` (`lib/chess-trainer/farm-popularity.ts`). Ties go to reach (your games), then oldest first. Positions not counted yet wait behind every counted one.
- **Database:** since 2026-10-17 the farm's API on ws21 (`boardgames-server` user unit) runs on the **production** database through a systemd drop-in, `prod-db.conf` → `~/chess-farm/prod-db.env`. A staging refresh once wiped every job and result. A claim older than `LEASE_MS` (60 days) may be taken by another lane; a stopped lane releases its job.
- They feed each other through follow-ups: a finished position of yours queues the opponent position after your move (for the fleet), a finished opponent position queues your replies after its engine moves (for ws21).
- **Fleet:** `aws/fleet.sh up 8` on the laptop (AWS profile `boardgames`; builds Stockfish at boot), then on ws21 `~/chess-farm/aws-attach.sh $(…ips)`. Each instance reaches ws21's API through a reverse SSH tunnel ws21 opens (`farm-tunnel@<ip>` user unit); nothing on ws21 is exposed. An instance stops itself after an idle hour (`fleet.sh start` + attach again — the IPs change; `start` and `up` also swap the firewall rule to ws21's current address, which a reboot can change); `fleet.sh down` removes everything.

## AWS accounts

The fleet runs on Free-plan credits, one account at a time; any account works. `fleet.sh` takes the account from `AWS_PROFILE` (default `boardgames`) and the region from that profile, and `up` creates what it needs in it (key pair from ws21's `chess_farm_ed25519`, a firewall group open to ws21's address only, the region's Amazon Linux image).

1. **Budget:** `AWS_PROFILE=<p> aws/fleet.sh hours 8` reads the Free-plan credits (`credits`) and says how many hours N machines can run, keeping `RESERVE` (default $5: on the Free plan, running out of credit can close the account). The figure trails real usage by up to a day, so take off whatever the fleet ran since.
2. **Run with a deadline:** `aws/fleet.sh up 8` (or `start` for a stopped fleet), then on ws21 `FLEET_HOURS=<h> ~/chess-farm/aws-attach.sh $(aws/fleet.sh ips)`. `DRAIN_HOURS` (3) before the deadline every lane stops claiming and finishes its job; a machine stops once its lanes are done, and at the deadline regardless. Nothing is cut short except a job still running at the deadline.
3. **Swap accounts:** when the first account is spent, `aws/fleet.sh down` there (terminates everything, no disks left to pay for), stop its tunnels on ws21 (`systemctl --user stop 'farm-tunnel@*'`), and free the jobs its lanes still held: `pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/release-lanes.ts --worker=aws- --prod --apply`. Then `aws login --profile <next>` and step 1–2 with `AWS_PROFILE=<next>`. Lane names come from the machines' IPs, so two accounts never share one.

## Running on ws21 (no repo checkout needed)

The scripts are bundled to standalone ESM and copied to `~/chess-farm/`:

```bash
E=node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild
cd packages/server && ../../$E src/scripts/chess-farm/{worker,calibrate,hash-test}.ts --bundle \
  --platform=node --format=esm --target=node22 --outdir=dist-farm --out-extension:.js=.mjs
scp dist-farm/*.mjs ws21:chess-farm/
```

The env lives in `~/chess-farm/farm.env` (chmod 600):
- `FARM_URL`
- `CHESS_FARM_TOKEN`, which must match the server's
- `FARM_WORKER`
- `SF_PATH`, `SF_LABEL`, `SF_THREADS`, `SF_HASH_MB`
- optionally `LC0_PATH`, `LC0_WEIGHTS`, `LC0_BACKEND`, `LC0_LABEL`
- `FARM_POLICY=policy.json`

```bash
cd ~/chess-farm && set -a && . ./farm.env && set +a && node worker.mjs
```

### Stockfish

Profile-guided builds for Zen 4 live in `~/chess-farm/src/build-sf.sh`, one per pinned ref (`sf_19`, the dev commit):

```bash
make -j profile-build ARCH=x86-64-avx512icl
```

### Lc0

No sudo needed. CUDA 13.4 + cuDNN 9.27 are NVIDIA's redist tarballs unpacked into
`~/.local/cuda-13.4` (`cuda_nvcc cuda_cudart cuda_crt cccl libnvvm libcublas libcurand
cuda_nvrtc cuda_profiler_api libnvjitlink` + `cudnn`, from
`developer.download.nvidia.com/compute/{cuda,cudnn}/redist/`), with `lib64 -> lib`.
meson comes from `pipx install meson`. Then, in `~/chess-farm/src/lc0` at tag `v0.33.0-rc0`:

```bash
D=~/.local/cuda-13.4; export PATH=$D/bin:$PATH
meson setup build --buildtype=release -Db_lto=true -Dplain_cuda=true -Dcudnn=false \
  -Donnx=false -Dopencl=false -Dgtest=false -Dcc_cuda=120 -Dnative_cuda=false \
  -Dcudnn_libdirs=$D/lib -Dcudnn_include=$D/include
ninja -C build && cp build/lc0 ~/chess-farm/bin/lc0-v0.33.0-rc0
```

`~/chess-farm/bin/lc0` is a wrapper that sets `LD_LIBRARY_PATH` to the CUDA libs. The
network is `BT4-1024x15x32h-swa-6147500-policytune-332.pb.gz` (BT4-it332) in
`~/chess-farm/nets/`, from storage.lczero.org. On the RTX 5090, `cuda-fp16` runs ~16k
nodes/s (default minibatch; plain `cuda` is 6× slower), so a 1M-node tie-break takes about a
minute. Its `WL` in `VerboseMoveStats` is from the side to move.

### systemd

ws21 never sleeps, so it also runs the API the worker talks to: the user unit
`boardgames-server.service` runs this repo's server (`tsx src/index.ts`, port 3001, the
staging database from `packages/server/.env`, which has `CHESS_FARM_TOKEN`), and
`FARM_URL=http://localhost:3001`. Members' browsers queue positions through whichever server
they use — the database is shared. The server refuses to start on a database migrated past
its code (so does the refill), so ws21's checkout must follow master.

**Upkeep** (since 2026-11-02; `ws21-upkeep.sh` → `~/chess-farm/farm-upkeep.sh`, units
`ws21-upkeep.{service,timer}` → `chess-farm-upkeep.*`, every 15 min):
- fast-forwards the checkout to GitHub's master, only on a clean tree (untracked files are
  fine) and without LFS files (`GIT_LFS_SKIP_SMUDGE=1`: they cost GitHub LFS budget);
- runs `pnpm install` when the lockfile moved;
- restarts `boardgames-server` when server or core code moved, and goes back to the old commit
  if it doesn't come up healthy;
- rebuilds `~/chess-farm/worker.mjs` when the bundle comes out different (the old one stays as
  `worker.mjs.prev`). Lanes switch at their next claim, so farm code reaches ws21 by landing on
  master; a hand-copied bundle lasts only until the next master change.

**Idle lanes stop themselves:** drop-in `chess-farm@.service.d/idle-exit.conf` sets
`FARM_IDLE_EXIT_MIN=5` (exit 0, not restarted), except lane 1, which serves Lc0 to the others
(`lane-1.env`: `FARM_IDLE_EXIT_MIN=0`). Upkeep wakes stopped lanes when normal work is queued:
one per waiting job, as many as memory allows (1.5 GB each, 3 GB kept free). After a reboot every enabled lane starts, and the idle ones stop again.

The worker is the user unit `chess-farm.service` (`~/.config/systemd/user/`; lingering is on):
`systemctl --user start chess-farm`, logs with `journalctl --user -u chess-farm -f`.

### No heavy lane (since 2026-11-05)

Every job runs on a normal lane (one thread, core's `SEARCH` hash) to its full depth, however
long it takes: nothing is handed over, screened or cut short. A few searches blow up (nearly
always a decided position, one side a queen or rook up, where each depth costs several times
the last) and hold their lane for days or weeks; the other lanes carry on meanwhile. Their
claims last `LEASE_MS` (60 days), and a `/complete` of a search over an hour is also kept in
`~/chess-farm/results/<id>.json` and offered again every minute for two days.

From 2026-10-22 to 2026-11-05 those searches went to a heavy lane instead (one core, a 23 GB
hash; for a day every core and a 50 GB hash). It was the wrong trade: the target is a depth, a
single thread reaches it with the fewest nodes, and one lane let one blow-up block ~500 jobs
for days (on 24 threads a d40 job took 13× the nodes of one thread and was no faster). Its 11
results were deleted and their jobs queued for the normal lanes (backup in
`scratch/chess-farm/heavy-redo-production.json` and `~/chess-farm/`), so every result comes
from the one setup. Once they are back, `redo-compare.ts --prod` sets old beside new; where a
move of yours changed, `prune-off-tree.ts --prod --apply` deletes the line past the old one.

## Calibrate before a big run

```bash
node calibrate.mjs positions.json --out calibration.json --policy policy.json \
  --max-depth 50 --cap-seconds 360 --budget-hours 90 --scale 2.4 --limit 30
```

`--scale` projects the measured tree to the full import (≈ games after import ÷ games now, growth ~0.75 power). The report gives:
- hours at the spec depths
- the fitted depths, which go into `policy.json`

Run it with ws21 otherwise idle; its numbers decide the run.

## Seeing the farm from a laptop

The farm reads and writes **production** (the ws21 farm API runs against the prod DB). A laptop dev
server talks to staging, so its trainer neither feeds the farm nor sees new
results. `sync-evals-to-staging.ts` copies prod's finished evaluations into
staging and makes staging's job queue a copy of prod's (for the Home's ETAs):

    pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/sync-evals-to-staging.ts

