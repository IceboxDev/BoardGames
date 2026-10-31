# shelf-packer

Offline optimizer that packs the group's board game boxes into flush,
front-facing rectangles on shelves — the "how do I fill 85×25 cm perfectly"
problem. C++20, no dependencies, plain Makefile (same layout as
`cpp/the-hunger`).

```bash
make                 # build/shelf-packer
make test            # unit tests (ASan + UBSan where installed) + CLI scenarios
make run             # the canonical runs, each re-checked with --verify:
make fill            #   one shelf / two shelves filled / the strict variant
make ultimate
build/shelf-packer --help
```

On the laptop g++ lives in the `cxx` toolbox: `toolbox run -c cxx make test`.
For sanitized unit tests there, install the runtime once:
`toolbox run -c cxx sudo dnf install libasan libubsan` (without it the
Makefile says so and builds the tests unsanitized).

## Model

- Every box (`width × length × height`, mm) shows a **front face** of
  `width×height` or `length×height`, each optionally turned 90° so the box
  stands on its edge, spine out. The remaining dimension goes **into** the
  shelf and must fit the shelf's depth. `--flat` forbids the standing faces.
- A shelf is a row of **piles** standing on the floor. A pile is a stack of
  **cells** sharing one width (each cell at most `2·tol + --width-slack`
  narrower than the pile, the gap counted as holes). A cell is one or more
  side-by-side **units** whose heights match within `2·tol`; a unit is one
  box or a column of boxes, each no wider than the box below (+`2·tol`).
- Every pile reaches the nominal height (`--height`, less `--height-slack`)
  and stays inside the top reserve; tolerance is applied per layer, never
  banked across a pile. The row may overhang the nominal width into the
  side reserves.
- After layout, **gravity** settles every box onto the highest box below it
  that it overlaps (boxes stay level). Every contact rule, the standing-top
  rule and the hole metric are judged on the settled geometry.
- `--vert-inside`: standing boxes keep their tops under the nominal height.
  Without it they may reach into the top reserve like any box.

## Objectives

- **Default — most volume.** Maximize packed volume minus the reserve-spill
  penalty: every spilled mm² of front face costs `--spill-cost`% (default
  50) of what it could hold at full shelf depth, so a spill only wins when
  it packs denser than that. Ties: deeper boxes first.
- **`--fill-all`** — every shelf rectangle completely filled (total width ≥
  nominal, every pile at nominal height); rank by the holes left **inside
  the nominal windows** after choosing pile order, slack side and window
  position (edge slack that escapes into the reserve costs nothing), then
  by spill. Needs one `--shelf DEPTH` per shelf.

Both objectives work with 1–4 shelves (`--shelf`, repeatable; without it one
shelf of `--depth-max`, default 325).

## Rules

| Flag | Presence | Contact once all placed |
|---|---|---|
| `--require PAT` (repeatable) | all matches **must** be packed, as one group | touching (side or corner) |
| `--pair A,B[,…]` | **must** be packed | touching |
| `--together A,B[,…]` | all or none | touching |
| `--stack A,B[,…]` | all or none | a strict run: a **tower** (equal face widths, each box directly on the previous) or a **row of standing boxes** (equal heights, side by side, nothing between) |
| `--requires DEP,PROV` | DEP only with PROV (PROV alone is fine) | DEP and PROV meet along the long edges of **both** |

A group, once fully placed, is always on one shelf. `--long-edge PAT`: in
touching groups, that box's contacts only count along its long edge with a
positive overlap. `--pin-a PAT`: only on the first shelf. `--use-all`: every
box must be placed. `--exclude PAT`: drop boxes entirely. A PAT is a box
name or `PREFIX*`; every PAT must match at least one box.

## Output

- `OUT/solutions.txt` (also on stdout) — per packing: holes, volume, spill,
  each shelf's piles left to right in the pile text form, boxes left out,
  and which search phase found it.
- `OUT/solution_NN.svg` (`solution_NN_A.svg`… with several shelves) — front
  view: numbered boxes, nominal window, dashed reserve, floor, legend.
- `OUT/packings.txt` — the machine-readable result (format in
  `include/sp/packings_file.hpp`): every pile and every box's settled
  position. `--warm` and `--verify` read it.

Packings differ from each other by at least 4 moved boxes; boxes of
identical dimensions count as interchangeable.

## Checking a result: `--verify DIR`

Re-checks `DIR/packings.txt` against `boxes.csv` and the flags given, from
the written geometry alone: every box known, placed once, in a legal
orientation for that shelf; no overlaps; nothing floating; inside the
reserve; piles at height (fill-all); `--vert-inside`; every group's presence
and contact rule. Exit 1 if anything is wrong. The Makefile runs it after
every canonical run.

## Carrying work between runs

- `--warm DIR` re-injects `DIR/packings.txt`: its piles join the candidates
  and its packings compete in the ranking, so a run never ranks below what
  an earlier run found **under the same rules**.
- `--library FILE` loads a persistent column library before the search and
  rewrites it afterwards (the cleanest columns per box and per touching box
  pair, plus every column of an arranged packing). `columns.lib` is the
  checked-in one.

Both go through the same admission check as enumerated piles: a column that
no longer fits the current `boxes.csv` (a re-measured box), shelf depth,
flags (`--flat`, `--vert-inside`, slack) or group rules is rejected and the
reasons are counted on stderr — never silently packed.

## Input

`boxes.csv`: `name,width_mm,length_mm,height_mm`, one physical box per line;
blank lines and `#` comments allowed. Names are unique and use only letters,
digits, `.`, `_`, `-`. Multi-box games are separate lines (pandemic-1/-2, the
7 Wonders expansions box, …). It is maintained by hand from the Games
Manager (`/u/<id>/collection` → Export CSV): one line per game from the
Width/Length/Height columns, plus one line per entry of its "Extra boxes"
column. The export itself is not in this format and is rejected on line 1.

## Exit status

0 packings written (or `--verify` found nothing wrong) · 1 nothing found /
problems found · 2 bad input (flag, CSV, file) · 3 internal error.

## Code

| Path | What |
|---|---|
| `include/sp/problem.hpp` | the resolved problem: geometry, shelves, objective, groups |
| `include/sp/rules.hpp` | what is legal: contact predicates, presence rules |
| `include/sp/model.hpp` | orientations, cells, piles — built only through `makeCell` / `composePile` |
| `include/sp/candidates.hpp` | per-shelf enumeration and **`checkPile`**, the one admission check |
| `include/sp/search.hpp` | beam passes + randomized greedy over piles, lexicographic scores |
| `include/sp/arrange.hpp` | pile / cell / unit order and gravity until every contact rule holds |
| `include/sp/tuning.hpp` | every search heuristic (none changes what is legal) |
| `include/sp/pile_text.hpp`, `packings_file.hpp`, `library.hpp` | the text formats |
| `include/sp/verify.hpp`, `report.hpp`, `cli.hpp`, `driver.hpp` | `--verify`, outputs, flags, the run |
| `tests/` | unit tests (`tinytest.hpp`) and `scenarios.sh` on `tests/scenarios/` |

Search: per shelf, exhaustive layer/pile enumeration (deduplicated by box
set), then beam passes over several pile orders and randomized greedy
restarts; states that can never become legal are dropped on the spot and the
rest are compared by priority (mandatory boxes, then the objective's
measure) instead of by penalty weights. `--seed N` explores other packings;
the same seed and flags give the same result.
