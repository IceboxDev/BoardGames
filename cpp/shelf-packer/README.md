# shelf-packer

Offline optimizer that packs the group's board game boxes into a flush,
front-facing rectangle on a shelf — the "how do I fill 85×25 cm perfectly"
problem. Self-contained C++17, no dependencies (its own PNG encoder).

## Model

- Every box (`width × length × height`, mm) shows a **front face** of either
  `width×height` or `length×height`, optionally rotated 90° — so a box can
  also stand on its edge, spine-out like a book. The remaining dimension goes
  **into** the shelf and must fit `--depth-max`. Pass `--flat` to forbid the
  rotated (spine-out) placements: every box then lies flat with its own
  height staying vertical.
- The packing is a row of **piles** standing flush on the floor. A pile is a
  stack of layers; a layer is 1–3 side-by-side UNITS whose heights match
  within tolerance — a unit is a single box or a 2-box COLUMN (upper box no
  wider than its support), so A+B and C+D with matching totals form a flush
  2-story block. After layout, GRAVITY settles every box to its true
  resting height — the tallest settled top it overlaps, or the floor — so
  nothing ever floats over a tolerance dip; boxes stay level (a box on
  unequal supporters rests on the taller one). Cluster contact, long-edge
  rules, standing-box tops, and the hole metric are all evaluated on the
  settled geometry. Every layer in a pile shares the pile width (± tolerance),
  so all vertical seams are flush.
- Piles must reach the nominal height; the overflow allowances (30 mm per
  side, 35 mm up top) are RESERVE, not budget — spilling into them is allowed
  but penalized: each spilled mm² of front face costs `--spill-cost`% (default
  50) of what that area could hold at full shelf depth, so a spill only wins
  when it packs denser than that bar. Measurement tolerance (±1 mm/box) is
  applied per layer, never banked across a whole pile.
- Objective: **maximize packed volume minus the spill penalty**, tie-broken by
  depth used (deeper boxes waste less shelf). Emitted solutions are
  diversified — two solutions must differ by at least 6 boxes.
- `--require NAME` (repeatable, `PREFIX*` globs) marks must-pack boxes that
  additionally have to form ONE touching cluster (side or corner contact).
- `--vert-inside` allows rotated (spine-out) placements only where the
  standing box's top stays inside the nominal rectangle; such cells are
  forced to the pile bottom and re-verified on the final geometry.
- `--pin-a NAME/GLOB` (repeatable, fill-all only) restricts boxes to shelf A.
- `--exclude NAME/GLOB` (repeatable) drops boxes from the pool entirely.
- `--long-edge NAME` (repeatable): this box's cluster contacts only count
  along its LONG edge with positive overlap (corner contact never counts).
- `--requires DEP,PROV` (repeatable): DEP may only be packed if PROV is too
  (PROV alone is fine), on the same shelf, touching along BOTH long edges.
- `--stack A,B[,C…]` (repeatable): all-or-none like `--together`, but the
  group must chain long-side-to-long-side (every internal contact lies on a
  long edge of BOTH boxes — flat rows stacked, or standing side by side).
  Piles carrying a proper subset of a stack group are pruned outright.
- `--use-all` (fill-all only) demands EVERY box be placed; when that is
  infeasible the run reports the closest width-complete attempt and which
  boxes stayed out, instead of emitting solutions.
- `--together A,B[,C…]` (repeatable) declares a companion group — one game
  shipped as several boxes: either NONE of them is packed, or ALL are, and
  they must touch each other.
  For both, the arranger places cluster-carrying piles consecutively, sinks
  cluster cells to the pile bottoms, and permutes pile order + side-by-side
  box order until a geometric connectivity check passes for every cluster;
  solutions that can't be arranged are dropped.

Search: exhaustive layer/pile enumeration (deduped by box-set), then several
beam-search passes over pile candidates plus 20k density-biased greedy
restarts. Runs in ~2 s for ~46 boxes.

## Usage

```bash
make                       # builds ./shelf-packer
./shelf-packer boxes.csv --out out --require 'exit-*' --together publish,campus
make fill                  # two-shelf double-fill mode (below)
```

### Double-fill mode (`--fill-all`)

`--fill-all --shelf 325 --shelf 470` packs TWO shelves of the same front
rectangle (different depths) at once, with a different objective: both
rectangles must be completely filled (every pile reaches nominal height,
total width >= nominal), and the ranking minimizes **holes inside the nominal rectangle**: raw pile
slack is only the search heuristic — the final pass re-ranks by the holes
that remain after choosing the pile order, the per-pile slack side, and the
window position along the overhang, so edge slack that escapes into the
overflow allowance costs nothing. Reserve spill is the tie-break. Volume no longer matters and boxes that
don't help simply stay out (fitting EVERY box is provably impossible: of the
five 297x297 boxes only three can ever complete a pile). Clusters must sit
wholly on one shelf. Output: `solution_NN_A.png` / `solution_NN_B.png` per
solution. `--width-slack MM` / `--height-slack MM` optionally legalize larger
mismatches as counted holes — required for `--flat` double-fills: strict
flat-only tops out ~35 mm short of filling both rectangles, while
`--flat --width-slack 6 --height-slack 15` completes them at ~30 cm2 of
holes (vs ~6.4 cm2 unrestricted). Expect ~7 min runtime with width slack.

Outputs `out/solutions.txt` plus one `out/solution_NN.png` per solution:
front view with floor line, shelf outline, and dashed reserve bounds; every
box is numbered, and a legend below the diagram lists each number with the
full name, placed face (`W×H dDEPTH`), and the raw box dimensions.

Flags (all mm): `--width 850 --height 250 --over-left 30 --over-right 30
--over-top 35 --depth-max 325 --tol 1 --spill-cost 50 --solutions 8
--out DIR`. Raise `--spill-cost` toward 100 to keep packings inside the
nominal window unless a spill is nearly free volume.

## Input

`boxes.csv`: `name,width_mm,length_mm,height_mm`, one physical box per line,
`#` comments allowed. Multi-box games are separate lines (pandemic-1/-2, the
7 Wonders expansions box, …). The checked-in file mirrors the measured
collection in the Games Manager — regenerate it from
`/u/<id>/collection` → Export CSV (primary dims + the "Extra boxes" column)
when measurements change.
