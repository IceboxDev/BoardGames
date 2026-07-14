# 7 Wonders — C++ engine (5 players)

A fast, cloneable, **perfect-information** game engine for 7 Wonders (base game +
Edifice expansion), fixed at 5 players. It enumerates every legal move and applies
state transitions cheaply enough to expand a game tree — the substrate for a future
ISMCTS/MCTS search. It is a faithful port of the TypeScript engine in
`packages/core/src/games/7-wonders/`, validated move-for-move against it.

## Build & test

Plain Makefile (no CMake needed), C++20, g++/clang++.

```bash
make test     # build + run all unit + parity tests
make cli      # build the sw7 demo binary (build/sw7)
make bench    # -O3 build + throughput benchmark
make clean
```

```
sw7 deal <seed> [edifice]     print the dealt game
sw7 moves <seed> [player]     list legal moves at the opening
sw7 playout <seed> [edifice]  random self-play to game-over + score breakdown
sw7 bench [games]             full random playouts/sec + moves/sec
```

## Design

- **`GameState` is a trivially-copyable value type** (fixed arrays, no pointers/heap).
  A search-tree node clone is `GameState next = cur;` and `apply(next, move)` mutates
  in place — no allocation on the hot path.
- **Cards** are integer `CardType` ids into a static table (`include/sw/cards.hpp`);
  a `nameId` bitset on each player gives O(1) duplicate-name / chain checks.
- **Payment** (`payment.cpp`) is an allocation-free Pareto DFS over resource-mask
  pools — the move-generation hot path.
- **Perfect information**: the state holds all hands and both future decks concretely.
  Hidden-information sampling (determinization) is a future search-layer concern, not
  the engine's.

### Layout

```
include/sw/*.hpp   public headers (state, move, rules, engine, payment, scoring, ...)
src/*.gen.cpp      GENERATED data tables (cards/wonders/edifice) — do not edit
src/*.cpp          engine implementation
cli/main.cpp       sw7 demo/bench
tests/             unit tests + the cross-engine parity replay
```

## Data is generated from the TS rules (single source of truth)

The card/wonder/edifice tables are emitted from the TypeScript definitions so they
can never drift:

```bash
pnpm gen-cpp-7wonders        # rewrites src/{cards,wonders,edifice}.gen.cpp
```

The generated files are checked in, so building the C++ needs no Node — only
regenerating does.

## Correctness: cross-engine parity

The RNG (Mulberry32) and deck-build order are replicated exactly, so a seed deals an
identical game in both engines. `scripts/dump-7wonders-parity.ts` records seeded TS
games (legal sets + chosen move + final scores) to `tests/fixtures/`, and the C++
`parity_test` replays them, asserting the C++ legal set equals TS's at every decision
and that final totals + winner match. Validated with **zero divergence over 1000
games** (base + Edifice); a 150-game fixture is committed so `make test` verifies
parity out of the box. Regenerate a larger sweep by raising the loop bound in the dump
script.

## Search + AI

- **M0 — simultaneous-move MCTS** (`include/sw/mcts.hpp`, `src/mcts.cpp`). Every active
  seat runs its own bandit over its legal moves; the joint move descends a shared tree.
  Per-seat rank reward in [0,1] (general-sum). `sw7 eval` → ~98% vs random.
- **M1 — AlphaZero-style self-play** (perfect information):
  - `src/features.cpp` — seat-relative feature encoding (187 floats).
  - `src/net.cpp` — MLP inference (policy over `cardType×action` = 312, per-seat value
    5-vector), weights loaded from a flat binary file (no ML deps in C++).
  - `mcts.cpp` PUCT mode — net priors + net value at leaves (no rollouts → ~2.4× faster
    than M0).
  - `sw7 selfplay <g> <it> <out.bin> [w.bin]` generates training samples; `sw7 evalnet`
    benchmarks a net.
  - `train/train.py` (numpy) and `train/train_torch.py` (GPU drop-in, same formats);
    `train/loop.py` runs the full self-play↔train loop with a replay-buffer window.

The whole loop is validated end to end on CPU (data-gen → train → net loads → PUCT plays
→ improves with scale: bootstrap 46% → 87.5% vs random). Frontier strength is a matter of
scaling the loop on a GPU (bigger net, more iterations) via `train/loop.py --trainer torch`.

- **M2 — phase-adaptive imperfect information** (`include/sw/determinize.hpp`,
  `src/determinize.cpp`). Because hands rotate deterministically, the set of opponent hands
  seat `me` cannot pin down is a pure function of the turn — in a 5-player age it is
  `{t1:4, t2:3, t3:2, t4:0, t5:0, t6:0}` (turn 4 collapses; the last un-held hand is fixed by
  elimination). `numUnknownHands` gives the phase gate; `determinize` keeps me's hand + all
  public state and re-partitions only the unknown hands (+ reshuffles unseen future decks).
  `ismctsChooseMove` is ensemble PIMC over `dets` determinizations, falling back to
  perfect-info search once nothing is unknown. `sw7 evalii <w.bin|-> [g] [it] [dets]`.
  **Result: the imperfect-information agent scores 87.5% vs the perfect-information agent's
  90.0% on the same games — a 2.5% gap. Hidden information is nearly free here**, because it
  self-destructs mid-age. A *learned* belief net to bias the turn-1–3 determinizations is a
  deferred refinement (low marginal value vs random; revisit vs strong opponents).
- **M3 — population robustness (PSRO-lite)** (`include/sw/heuristic.hpp`, `src/heuristic.cpp`).
  Five style-distinct heuristic archetypes (military / science / civilian / commercial /
  balanced) form a diverse **held-out opponent pool** — a far tougher, more meaningful test
  than random. `sw7 evalpop <w|-|heN>` benchmarks an agent against it; `sw7 selfplay-pop`
  generates data with archetype opponents (learner searches, opponents play their style);
  `train/loop.py --population` runs the robustified loop. **Findings** (60 games, 400 iters):
  raw M0 search generalizes well to the pool (63%); a **self-play-only net overfits (22%)**,
  but a **population-trained net of the same size nearly doubles it (42%)** — PSRO-lite works.
  (A CPU-scale value net still trails raw rollouts; exceeding search is a GPU-scale outcome.)
- **M4 — online deployment** (`sw7 move`, `packages/core/.../ai/cpp-bridge.ts`,
  `packages/server/.../sessions/cpp-agent.ts`). The TS server drives the C++ agent through a
  pure-integer wire format (CardType ids — the parity encoding): `serializePosition` →
  `sw7 move` (position on stdin → canonical move on stdout) → `matchCanon` back to a legal
  `SevenWondersAction`. Core stays dependency-free via an **injectable AI hook**
  (`ai/agent.ts` `setAiAgent`); the server injects the subprocess agent, opt-in with
  `SW7_ENABLE=1` (+ `SW7_BIN`, `SW7_WEIGHTS`, `SW7_ITERS`, `SW7_DETS`), and any failure falls
  back to the random stub. **Validated end to end**: a full TS game driven by `sw7 move`
  played legally throughout and won 9/10 vs random (`pnpm tsx scripts/test-cpp-bridge.ts`).

### v1 AI — playing against it

The **v1 AI is the search-only agent** (`SW7_WEIGHTS=-`) — no net, no training, strong and
robust. It uses heuristic rollouts (balanced archetype) and imperfect-information
determinization so it plays *fair* (doesn't peek at your hand). Defaults: `SW7_ITERS=1200`,
`SW7_DETS=4` (~0.1–0.5s per move; well under budget).

Play locally (1 human vs 4 AI):
1. `cd cpp/seven-wonders && make agent` → builds the optimized `build/sw7`.
2. `pnpm dev:all` (from the repo root). The server **auto-enables** the C++ agent when the
   binary exists (logs `[7w] C++ agent enabled …`); set `SW7_ENABLE=0` to force the random stub.
3. Open a 7 Wonders game, pick 5 players / solo-vs-AI — seats 1–4 are now the C++ agent.

Deploy (Railway): add `make agent` to the build, set `SW7_BIN=/abs/path/to/sw7`. Tune
`SW7_ITERS`/`SW7_DETS`, or ship a trained blueprint via `SW7_WEIGHTS`. WASM / N-API can replace
the subprocess later without changing the bridge format.

## Scope / status

- **M0–M4 complete.** Engine + search + self-play + robustness + a validated deployment bridge.
- Fixed at 5 players (`constexpr int N` in `include/sw/resources.hpp`).
- Learned belief net (M2 refinement) deferred; WASM / N-API binding is an optional swap for the
  subprocess bridge (M4).
- At CPU scale the search-only agent (M0/M2, `SW7_WEIGHTS=-`) is the strongest *robust* choice
  and needs no training — deployable today. The learned net's advantage arrives with GPU-scale
  training (`train/loop.py --trainer torch --population`), then ship the blueprint as
  `SW7_WEIGHTS`.
