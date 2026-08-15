# shelf-packer

Offline optimizer that packs the group's board game boxes into a flush,
front-facing rectangle on a shelf — the "how do I fill 85×25 cm perfectly"
problem. Self-contained C++17, no dependencies (its own PNG encoder).

## Model

- Every box (`width × length × height`, mm) shows a **front face** of either
  `width×height` or `length×height`, optionally rotated 90° — so a box can
  also stand on its edge, spine-out like a book. The remaining dimension goes
  **into** the shelf and must fit `--depth-max`.
- The packing is a row of **piles** standing flush on the floor. A pile is a
  stack of layers; a layer is 1–3 boxes side by side whose face heights match
  within tolerance. Every layer in a pile shares the pile width (± tolerance),
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
  The arranger places required piles consecutively, sinks required cells to
  the pile bottoms, and permutes pile order + side-by-side box order until a
  geometric connectivity check passes; solutions that can't be arranged are
  dropped.

Search: exhaustive layer/pile enumeration (deduped by box-set), then several
beam-search passes over pile candidates plus 20k density-biased greedy
restarts. Runs in ~2 s for ~46 boxes.

## Usage

```bash
make                       # builds ./shelf-packer
./shelf-packer boxes.csv --out out --require 'exit-*'
```

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
