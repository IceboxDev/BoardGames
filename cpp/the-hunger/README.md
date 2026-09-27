# The Hunger — C++ engine

A fast, trivially-copyable port of the TypeScript engine in
`packages/core/src/games/the-hunger/` (2–6 players, Elder and Rookie), with
**exact trace parity**: for the same seed and the same choices it produces the
same legal actions, in the same order, and byte-identical states. The AI ports
— Nosferatu (`heuristic-v1`), `determinize`, the rollout policy and Strigoi —
make the same decisions as the TS ones, so benches can run here instead.

## Build & test

Plain Makefile, C++20, g++/clang++.

```bash
make test                          # build + unit tests + parity replay of tests/fixtures
make cli                           # optimized build/hg (-O3 -march=native -DNDEBUG); alias: make agent
make bench                         # cli + throughput numbers
make parity DIR=/tmp/hunger-parity # replay any fixture directory
make clean
```

```
hg parity <fixtures-dir> [--no-strigoi] [-v]
hg bench [games]
hg arena <candidate> <baseline> <players> <deals> [--rollouts N] [--mode elder|rookie]
         [--offset K] [--threads T] [-v]
hg play <players> <seed> [elder|rookie]
hg expcheck <file>
```

Strategies are `strigoi`, `heuristic` (= `heuristic-v1`, `nosferatu`) and
`random`. `arena` seats one candidate against baselines, the candidate's chair
is `deal % players`, and deal `d` uses the TS `seedForGame(d + offset)`
(`tournament-runner.ts`), so a Strigoi/Nosferatu arena game is the same game
as `simulateGame(...)` in TS (verified: identical scores and winners).
`random` seats draw from their own Mulberry32 stream (the TS Fledgling seeds
from the log length, which the C++ engine does not keep).

## Layout

```
include/hg/data.hpp       content table types + vocab enums (orders match the codegen)
include/hg/data.gen.hpp   GENERATED counts
include/hg/state.hpp      GameState / TurnState / PlayerState / Action (fixed arrays, no heap)
include/hg/engine.hpp     board, rules, engine, scoring, canonical hash
include/hg/ai.hpp         heuristicPick, determinize, playout, outcomeUtility, strigoiPick
include/hg/parity.hpp     fixture replay
src/*.gen.cpp             GENERATED cards / missions / bonus tokens / boards — do not edit
src/board.cpp             board.ts (walk DFS, Mist, Spicy, Confuse, push)
src/rules.cpp             rules.ts (getLegalActions, same order)
src/engine.cpp            game-engine.ts (setup, applyInPlace + every automatic follow-up)
src/scoring.cpp           scoring.ts (choice tokens, Missions, placements)
src/canon.cpp             search/canon.ts (canonical text + FNV-1a 64)
src/heuristic.cpp         ai-heuristic.ts
src/search.cpp            search/determinize.ts, search/rollout.ts, search/strigoi.ts
src/js_exp.cpp            V8's Math.exp (fdlibm), bit-for-bit
cli/main.cpp              hg
tests/                    unit tests + the parity replay; fixtures/ from the TS dumper
```

### Design

- **`GameState` is a trivially-copyable value** (~7 KB): `Vec<T, N>` fixed
  arrays mirror each TS array with its exact `push` / `pop` / `shift` /
  `splice` / `filter` semantics (the END of `huntDeck` and `deck` is the top).
  A search clone is `GameState g = s;`, and `apply(g, seat, action)` mutates in
  place. Capacity overflow aborts loudly (never seen in 4k+ games and millions
  of playouts).
- **Ids are ints.** Physical cards (`defId#n`, `defId#p-n`), Missions and Bonus
  tokens are numbered in **JavaScript's default string sort order** (UTF-16
  code units), so every "sort the string pool" in TS (determinize's pools,
  `missionKeepSets`) is an int sort here. Spaces keep the board file's order and
  carry two generated ranks: code-unit (`.sort()`: adjacency, Mist, Spicy
  Wells, chest/crypt keys) and `localeCompare` (walk and Spicy destinations).
- **Same RNG, same shuffles.** Mulberry32 lives in `state.rng` (int32
  wraparound, `Math.imul`, `>>>`), Fisher–Yates uses
  `floor(random() * (i + 1))` in doubles, and every shuffle happens in the TS
  order (Rookie A cards, Hunt deck, Bonus tokens, public/rest Missions, each
  starting deck, discard reshuffles).
- **`std::stable_sort` with the TS comparators** reproduces V8's stable
  TimSort (turn order, push queue, Turn-1 order, placements, Strigoi arms).
- **Floating point** (Nosferatu, Strigoi): expressions keep the TS operation
  order, the build uses `-ffp-contract=off` (no FMA fusion), and
  `outcomeUtility` calls `jsExp`, a port of V8's fdlibm `Math.exp`, so every
  value is bit-identical — `hg expcheck` confirmed 2,004,011 / 2,004,011
  arguments against Node. Strigoi therefore agrees on **100%** of decisions,
  not "all but exp-ulp ties".
- The engine keeps no `log` (search never reads it).

## Data is generated from the TS content (single source of truth)

```bash
pnpm gen-cpp-hunger     # or: cd packages/core && npx tsx ../../scripts/gen-cpp-hunger.ts
```

rewrites `src/{cards,missions,bonus_tokens,board}.gen.cpp` and
`include/hg/data.gen.hpp` from `content/{cards,missions,bonus-tokens,boards}.ts`
(boards A, the derived B, and the test layout; adjacency and BFS distances come
from `board.buildGraph` itself). The output is deterministic, so CI can
regenerate and `git diff --exit-code`. The generated files are checked in:
building needs no Node.

## Correctness: cross-engine parity

The contract is `packages/core/src/games/the-hunger/search/canon.ts`:
`canonicalState(state)` writes every rules-relevant field (not `log`, `seed`,
or seat controllers) in a fixed key order with optional fields normalised, and
`stateHash` is FNV-1a 64 over it. `src/canon.cpp` emits the same bytes.

`scripts/dump-hunger-parity.ts` plays seeded TS games — 2–6 seats × Elder /
Rookie (some with `beginnerSafeMountains`), seats random / Nosferatu / mixed,
plus Strigoi (8 rollouts) vs Nosferatu games — and records per decision: the
active seat, the legal list (count + FNV hash of the canonical actions; the
full list for `--full` / the first `--full-games` games), the chosen index,
Nosferatu's pick, the state hash after the action, every 5th step the hash of
`determinize(state, seat, mulberry32(K))`, Strigoi's pick, and the final
scores / winners / placements. `parity_test` (and `hg parity`) replays them and
requires zero divergence and ≥ 99% Strigoi agreement.

```bash
pnpm dump-hunger-parity                       # rewrites tests/fixtures (150 games + 12 Strigoi, ~2.4 MB; ~2.5 min)
cd packages/core && npx tsx ../../scripts/dump-hunger-parity.ts \
  --out /tmp/hunger-parity --games 1000 --full --strigoi 0   # big sweep, full legal lists
cd cpp/the-hunger && make parity DIR=/tmp/hunger-parity
```

Results (2026-09-27):

| set | games | decisions | legal / hash / heuristic / determinize / result divergence | Strigoi |
|---|---|---|---|---|
| committed `tests/fixtures` | 150 + 12 | 32,014 | 0 / 0 / 0 / 0 (6,337) / 0 | 823 / 823 |
| `/tmp`, `--full`, games 0–999 | 1,000 | 197,337 | 0 / 0 / 0 / 0 (39,059) / 0 | — |
| `/tmp`, games 1000–3999 | 3,000 | 590,721 | 0 / 0 / 0 / 0 (195,920) / 0 | — |

Every action type and all eight Instant Missions occur in the sweeps.

## Throughput

`hg bench` (4p Elder Nosferatu self-play, 43,418 decisions) against the same
measurements of the TS engine on the same machine:

| | C++ (`-O3 -march=native`) | TS (Node 26) | |
|---|---|---|---|
| copy + apply (`applyUnchecked`) | 0.98 µs | 20 µs | ~20× |
| legal actions | 0.91 µs | 7.9 µs | ~9× |
| Nosferatu pick | 3.1 µs | 34 µs | ~11× |
| canonical hash | 12.7 µs | 67 µs | ~5× |
| 4p Nosferatu playout | 0.22 ms | 10–11 ms | ~50× |
| Strigoi, 2p game vs Nosferatu (96 rollouts) | 0.18 s | ~3.5 s | ~20× |

A Strigoi decision at 96 rollouts costs ~19 ms (4p); `arena` spreads deals
over all cores.

## WebAssembly bridge (TS server → C++ search)

The server calls this engine's AI through WebAssembly:
`packages/core/src/games/the-hunger/search/wasm-agent.ts`.

- **Wire format = canonical text.** TS writes `canonicalState(state)`;
  `src/canon_parse.cpp` (`parseCanonicalState` / `tryParseCanonicalState`,
  `include/hg/canon_parse.hpp`) is the writer's exact inverse — it matches
  every literal verbatim (no whitespace, fixed key order, no escapes) and
  rejects anything else with a message naming the offset, so
  `canonicalState(parse(t)) == t` byte for byte.
- **No actions cross.** C++ enumerates the legal list itself (same order as
  `rules.ts`) and returns an index; TS checks `hg_legal_count()` against its
  own `legal.length` and throws on a mismatch.
- **`wasm/agent.cpp`** exports `hg_alloc`, `hg_free`,
  `hg_pick(text, len, seat, strategy, cfg*, cfgLen)` (strategy 0 Nosferatu,
  1 Strigoi, 2 Dracula; returns the index or a negative `HG_E_*` code with a
  message at `hg_error_ptr/len`), `hg_legal_count`, `hg_canon` (round trip,
  for tests), `hg_playouts` (benches) and `hg_abi_version`. The config is a
  positional `double` array, NaN = keep the C++ default:
  Strigoi `[rollouts, minPerArm]`, Dracula `[rollouts, minPerArm, timeMs,
  tierMargin]`. A new `DraculaConfig` field = one `set(...)` line in
  `draculaConfig()` plus the name in `DRACULA_CONFIG_FIELDS` (append only).
- **Build** (`make wasm` → `build/hunger.wasm`): wasi-sdk
  (`WASI_SDK ?= ~/.local/wasi-sdk-34.0-x86_64-linux`), `-O3`, the same
  `-ffp-contract=off -fno-fast-math`, `-fno-exceptions -fno-rtti`,
  `-msimd128`, reactor model (no `main`; TS calls `_initialize`), 1 MB stack,
  `parity.cpp` left out. WASI imports: `clock_time_get` (Dracula's time
  budget; shimmed with `performance.now()`), `fd_write` (captured, surfaces
  `hg::fail` messages in the thrown error), `fd_seek`, `fd_close`.
- **Embedding.** `pnpm build-hunger-wasm` (= `tsx scripts/gen-hunger-wasm.ts`)
  runs `make wasm` and writes `search/wasm/hunger-wasm.gen.ts` (the bytes as
  base64), so the tsup-bundled server and every worker thread instantiate it
  synchronously with no file path. **Regenerate after any C++ change.**
- **A trap** (`hg::fail` → `abort`) throws `hunger wasm trapped: … (hg: …)`
  in TS and drops the instance; the next call starts a fresh one.

Tests:

```bash
make -C cpp/the-hunger test   # includes tests/canon_parse_test.cpp: tests/canon/states.txt
                              # round trip, parsed state plays like the original, bad input rejected
pnpm exec tsx scripts/gen-hunger-wasm.ts \
  --dump-states /tmp/hunger-canon.txt --games 1000 --offset 1000 --every 7
(cd cpp/the-hunger && HG_CANON_STATES=/tmp/hunger-canon.txt ./build/hg_tests "big sweep")
pnpm --filter @boardgames/core exec vitest run src/games/the-hunger/search/wasm-agent.test.ts
```

The committed `tests/canon/states.txt` (210 states: 2–6 seats × Elder /
Rookie, mid-turn, Mission picks, determinized worlds, finished games with
results) is `tsx scripts/gen-hunger-wasm.ts --dump-states cpp/the-hunger/tests/canon/states.txt
--games 30 --every 90`.

Results (2026-09-27): 45,044 / 45,044 sweep states round-trip; over 150 TS
games the wasm Nosferatu pick equals `heuristicPick` on 30,818 / 30,818
decisions and Strigoi (8 rollouts) equals `strigoiPick` on 360 / 360.

Speed, 12 4p Elder decisions (turns 1/5/10, mean 13.6 legal), Ryzen 9 7900X,
Node 26:

| | native `-O3 -march=native` | wasm (Node 26) | TS |
|---|---|---|---|
| Nosferatu playout | 0.17 ms | 0.28 ms | 5.4 ms |
| Strigoi decision, 96 rollouts | 22.6 ms | 31.0 ms | 502 ms |

(At 13.6 arms the `minPerArm = 4` floor dominates, so 32 rollouts cost about
the same: 17.8 / 29.5 / 433 ms.)
