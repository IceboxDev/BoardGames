# Chess analysis farm (ws21)

Deep "best move" evaluations for opening trees, by `BEST_MOVE_V1`
(`core/src/games/chess/trainer/eval-policy.ts`). The server queues positions
(`chess_eval_jobs`, migration 0056); this worker claims them, analyses them and
posts results into the shared cache (`chess_position_evals`).

## Files

- `worker.ts`: claim, analyse (`pipeline.ts`), then complete. One job at a time, every thread on it.
- `pipeline.ts`: the BEST_MOVE_V1 steps, in this order:
  1. lichess cloud lookup
  2. ChessDB candidates
  3. Stockfish to the tier depth, plus `searchmoves` for each candidate
  4. Lc0 tie-break
- `calibrate.ts`: Phase 0. Measures nodes-to-depth on real tree positions and lookup coverage, then fits the tier depths to a budget. It writes `policy.json`, which the worker reads.
- `sample-positions.ts`: picks calibration positions from a member's imported games (staging DB).
- `uci.ts`, `lookups.ts`: the UCI process wrapper, and the lichess / ChessDB clients.

## Running on ws21 (no repo checkout needed)

The scripts are bundled to standalone ESM and copied to `~/chess-farm/`:

```bash
E=node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild
cd packages/server && ../../$E src/scripts/chess-farm/{worker,calibrate}.ts --bundle \
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

Lc0 needs the CUDA toolkit (`sudo pacman -S cuda cudnn`) and meson (`pipx install meson`). Then:

```bash
git clone https://github.com/LeelaChessZero/lc0 && cd lc0 && git checkout v0.33.0-rc0
./build.sh   # cuda backend
```

The network is `BT4-it332` from lczero.org.

## Calibrate before a big run

```bash
node calibrate.mjs positions.json --out calibration.json --policy policy.json \
  --max-depth 50 --cap-seconds 360 --budget-hours 90 --scale 2.4 --limit 30
```

`--scale` projects the measured tree to the full import (≈ games after import ÷ games now, growth ~0.75 power). The report gives:
- hours at the spec depths
- the fitted depths, which go into `policy.json`

Run it with ws21 otherwise idle; its numbers decide the run.
