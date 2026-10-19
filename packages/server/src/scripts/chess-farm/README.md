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
- **The AWS fleet** (`FARM_KINDS=opp`, `aws/`) searches only opponent positions: MultiPV 3 to depth 40 (`aws-policy.json`), 2 threads, no Lc0. Free-plan `c7i-flex.large` instances, at most 8 (16-vCPU quota).
- **Claim order:** the position most played on lichess first. `chess_eval_jobs.popularity` (migration 0060) is the explorer's game count, every rating and speed, filled in the background by the API server that has `LICHESS_TOKEN` (`lib/chess-trainer/farm-popularity.ts`). Ties go to reach (your games), then oldest first. Positions not counted yet wait behind every counted one.
- **Database:** since 2026-10-17 the farm's API on ws21 (`boardgames-server` user unit) runs on the **production** database through a systemd drop-in, `prod-db.conf` → `~/chess-farm/prod-db.env`. A staging refresh once wiped every job and result. A claim older than `LEASE_MS` (7 days) may be taken by another lane; a stopped lane releases its job.
- They feed each other through follow-ups: a finished position of yours queues the opponent position after your move (for the fleet), a finished opponent position queues your replies after its engine moves (for ws21).
- **Fleet:** `aws/fleet.sh up 8` on the laptop (AWS profile `boardgames`; builds Stockfish at boot), then on ws21 `~/chess-farm/aws-attach.sh $(…ips)`. Each instance reaches ws21's API through a reverse SSH tunnel ws21 opens (`farm-tunnel@<ip>` user unit); nothing on ws21 is exposed. An instance stops itself after an idle hour (`fleet.sh start` + attach again — the IPs change); `fleet.sh down` removes everything.

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
its code, so pull ws21's checkout when a migration lands.

The worker is the user unit `chess-farm.service` (`~/.config/systemd/user/`; lingering is on):
`systemctl --user start chess-farm`, logs with `journalctl --user -u chess-farm -f`.

## Calibrate before a big run

```bash
node calibrate.mjs positions.json --out calibration.json --policy policy.json \
  --max-depth 50 --cap-seconds 360 --budget-hours 90 --scale 2.4 --limit 30
```

`--scale` projects the measured tree to the full import (≈ games after import ÷ games now, growth ~0.75 power). The report gives:
- hours at the spec depths
- the fitted depths, which go into `policy.json`

Run it with ws21 otherwise idle; its numbers decide the run.
