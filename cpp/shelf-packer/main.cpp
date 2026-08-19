// shelf-packer — pack board game boxes into a flush front-facing rectangle.
//
// Model:
//   Every box (w × l × h, mm) presents a FRONT FACE of either w×h or l×h,
//   optionally rotated 90° (so up to 4 orientations); the remaining dimension
//   goes into the shelf as DEPTH and must fit --depth-max.
//   The packing is a row of PILES standing flush on the floor. A pile is a
//   stack of CELLS; a cell is one box, or two boxes side by side whose face
//   heights match (± tolerance). All cells in a pile share the pile width
//   (± tolerance), so every vertical seam is flush.
//   Pile heights must reach the nominal rectangle height and may overshoot by
//   the allowed top overflow; pile widths sum to at most nominal width plus
//   the left+right overflow allowance.
//
// Objective: maximize total packed VOLUME; tie-break on total DEPTH used
// (deeper boxes waste less shelf). Emits the top-N distinct solutions as a
// text report and one PNG each (self-contained encoder, no libpng/zlib).
//
// Build:  make          (or: g++ -O2 -std=c++17 -o shelf-packer main.cpp)
// Run:    ./shelf-packer boxes.csv --out out/
// See README.md for the CSV format and every flag.

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

// ── Parameters (mm) ────────────────────────────────────────────────────
struct Params {
  // The overflow allowances are PADDING, not budget: spilling into them is
  // allowed up to the full 30/30/35 mm, but penalized — every mm² of front
  // face outside the nominal window costs half of what that area could hold
  // at full depth, so a spill only wins when it packs denser than 50%.
  int widthBase = 850;    // nominal rectangle width
  int overLeft = 30;      // hard left overflow limit (reserve — penalized)
  int overRight = 30;     // hard right overflow limit (reserve — penalized)
  int heightBase = 250;   // nominal rectangle height (must be reached)
  int overTop = 35;       // hard top overflow limit (reserve — penalized)
  int depthMax = 325;     // max depth into the shelf
  int tolPerBox = 1;      // per-box measurement tolerance (±mm)
  int spillCost = 50;     // reserve-spill penalty: % of full-depth volume per spilled mm²
  bool flatOnly = false;  // --flat: boxes lie flat only — no rotated (spine-out) faces
  // --shelf D (repeatable): shelf depths for multi-shelf fill-all mode.
  // --fill-all: every box must be placed; both rectangles completely filled;
  // objective flips to MINIMIZING mismatch holes (then reserve spill).
  std::vector<int> shelfDepths;
  bool fillAll = false;
  // Fill-all relaxations: mismatches become COUNTED HOLES instead of hard
  // failures. widthSlack = how much narrower than the pile a cell may be;
  // heightSlack = how far below nominal a pile top may stop.
  int widthSlack = 0;
  int heightSlack = 0;
  // --vert-inside: rotated (spine-out) placements are allowed ONLY when the
  // box top stays within the nominal rectangle (y + face height <= 250).
  bool vertInside = false;
  // --pin-a NAME/GLOB (repeatable): these boxes may only stand in shelf A.
  std::vector<std::string> pinA;
  uint64_t pinAMask = 0;
  // --use-all (fill-all only): EVERY box must be placed, or the run reports
  // the closest attempt instead of a solution.
  bool useAll = false;
  // --exclude NAME/GLOB (repeatable): drop boxes from the pool entirely.
  std::vector<std::string> exclude;
  // --long-edge NAME (repeatable): this box's cluster contacts only count
  // along its LONG edge (with positive overlap, corners don't qualify).
  std::vector<std::string> longEdge;
  uint64_t longEdgeMask = 0;
  // --requires DEP,PROV (repeatable): DEP may only be packed if PROV is too
  // (PROV alone is fine), same shelf, touching along BOTH boxes' long edges.
  std::vector<std::pair<std::string, std::string>> requiresRaw;
  std::vector<std::pair<uint64_t, uint64_t>> companions;  // (dep bit, prov bit)
  int solutions = 8;      // how many solutions to emit
  std::string out = "out";
  std::vector<std::string> require;  // --require NAME (or PREFIX*): must be packed,
                                     // and required boxes must form one touching cluster
  uint64_t requiredMask = 0;         // resolved after the boxes are loaded
  // --together A,B[,C…]: all-or-none companion groups (one game shipped as
  // several boxes). When present, the group's boxes must touch each other.
  std::vector<std::string> together;
  std::vector<uint64_t> togetherMasks;
  int maxWidth() const { return widthBase + overLeft + overRight; }
  int maxHeight() const { return heightBase + overTop; }
};

// ── Input ──────────────────────────────────────────────────────────────
struct Box {
  std::string name;
  int w, l, h;
  long long vol;
};

static std::vector<Box> loadBoxes(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    std::cerr << "cannot open " << path << "\n";
    exit(1);
  }
  std::vector<Box> boxes;
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#') continue;
    std::stringstream ss(line);
    std::string name, a, b, c;
    if (!std::getline(ss, name, ',')) continue;
    if (!std::getline(ss, a, ',') || !std::getline(ss, b, ',') || !std::getline(ss, c, ','))
      continue;
    Box box;
    box.name = name;
    box.w = std::stoi(a);
    box.l = std::stoi(b);
    box.h = std::stoi(c);
    box.vol = 1LL * box.w * box.l * box.h;
    boxes.push_back(box);
  }
  if (boxes.size() > 62) {
    std::cerr << "supports at most 62 boxes (bitmask); got " << boxes.size() << "\n";
    exit(1);
  }
  return boxes;
}

// ── Orientations & cells ───────────────────────────────────────────────
struct Orient {
  int box;
  int fw, fh, d;  // face width, face height, depth into shelf
  bool vert;      // rotated: the box's own height lies horizontal
};

struct Placement {
  int box;
  int fw, fh, d;
  int xOff, yOff;  // within the unit / stacked within the column
  int unit;        // which side-by-side unit of the cell this box belongs to
  bool vert;
};

// A unit: one box, or a 2-box COLUMN (one stacked on the other, the upper
// box no wider than its support + tolerance). Units stand side by side in a
// cell when their total heights match — so two columns A+B and C+D with
// A+B == C+D form a flush-topped 2-story block ("hole in the middle" waists
// are counted as mismatch holes like everything else).
struct Unit {
  uint64_t mask = 0;
  int width = 0, height = 0;
  long long vol = 0, faceArea = 0;
  int depthSum = 0, maxDepth = 0, vertTop = 0;
  std::vector<Placement> boxes;
};

// A cell: one box, or two side-by-side boxes with matching face heights.
struct Cell {
  uint64_t mask = 0;
  int width = 0, height = 0;  // height = max face height of members
  long long vol = 0;
  int depthSum = 0;
  long long faceArea = 0;  // Σ fw×fh of members (for the hole metric)
  int maxDepth = 0;
  int vertTop = 0;  // max face height among rotated members (0 = none)
  std::vector<Placement> boxes;
};

// A pile: stacked cells sharing one width.
struct Pile {
  uint64_t mask;
  int width, height;
  long long vol;
  int depthSum;
  long long holes = 0;  // pile rect area − Σ member face areas (mismatch gaps)
  int maxDepth = 0;
  std::vector<int> cells;  // indices into the cell list
};

// Front-face area a pile pushes above the nominal height.
static long long topOverArea(const Pile& pile, int heightBase) {
  return (long long)pile.width * std::max(0, pile.height - heightBase);
}

// A full packing.
struct Solution {
  uint64_t mask = 0;
  int width = 0;
  long long vol = 0;
  long long depthSum = 0;
  long long overArea = 0;  // front area spilled into the reserve (mm²)
  std::vector<int> piles;  // indices into the pile list
};

// Reserve spill is discouraged, not forbidden: each mm² of spilled front
// face costs half of what that area could hold at full shelf depth.
static long long solutionScore(long long vol, long long widthOverArea, long long topOverArea,
                               const Params& p) {
  return vol - (widthOverArea + topOverArea) * p.depthMax * p.spillCost / 100;
}

static std::vector<Orient> buildOrients(const std::vector<Box>& boxes, const Params& p,
                                        uint64_t excludeMask = 0) {
  std::vector<Orient> out;
  for (int i = 0; i < (int)boxes.size(); i++) {
    if (excludeMask & (1ULL << i)) continue;
    const Box& b = boxes[i];
    // (face pair, depth): w×h with depth l; l×h with depth w — each rotatable.
    // --flat drops the rotated variants: the box's own height stays vertical.
    // --vert-inside keeps them only when the standing box can fit under the
    // nominal top line (position is enforced at pile build + arrangement).
    int cand[4][3] = {{b.w, b.h, b.l}, {b.h, b.w, b.l}, {b.l, b.h, b.w}, {b.h, b.l, b.w}};
    std::set<std::tuple<int, int, int>> seen;
    for (int k = 0; k < 4; k++) {
      bool vert = k == 1 || k == 3;
      if (p.flatOnly && vert) continue;
      auto& c = cand[k];
      int fw = c[0], fh = c[1], d = c[2];
      if (p.vertInside && vert && fh > p.heightBase) continue;
      if (d > p.depthMax) continue;
      if (fh > p.maxHeight() + p.tolPerBox) continue;
      if (fw > p.maxWidth()) continue;
      if (seen.insert({fw, fh, d}).second) out.push_back({i, fw, fh, d, vert});
    }
  }
  return out;
}

static std::vector<Unit> buildUnits(const std::vector<Box>& boxes, const std::vector<Orient>& os,
                                    const Params& p) {
  std::vector<Unit> units;
  auto single = [&](const Orient& o) {
    Unit u;
    u.mask = 1ULL << o.box;
    u.width = o.fw;
    u.height = o.fh;
    u.vol = boxes[o.box].vol;
    u.faceArea = (long long)o.fw * o.fh;
    u.depthSum = u.maxDepth = o.d;
    u.vertTop = o.vert ? o.fh : 0;
    u.boxes.push_back({o.box, o.fw, o.fh, o.d, 0, 0, 0, o.vert});
    return u;
  };
  for (const Orient& o : os) units.push_back(single(o));

  // Columns: one box stacked on another, the upper no wider than its support
  // (+ tolerance), centered. Kept lean: best few thousand by mismatch.
  std::vector<Unit> cols;
  int wTol = 2 * p.tolPerBox;
  for (const Orient& b : os) {
    for (const Orient& u : os) {
      if (b.box == u.box) continue;
      if (u.fw > b.fw + wTol) continue;
      int h = b.fh + u.fh;
      if (h > 200) continue;  // taller stacks arise as stacked CELLS instead
      if (p.vertInside && u.vert && h > p.heightBase) continue;
      Unit c;
      c.mask = (1ULL << b.box) | (1ULL << u.box);
      c.width = std::max(b.fw, u.fw);
      c.height = h;
      c.vol = boxes[b.box].vol + boxes[u.box].vol;
      c.faceArea = (long long)b.fw * b.fh + (long long)u.fw * u.fh;
      c.depthSum = b.d + u.d;
      c.maxDepth = std::max(b.d, u.d);
      c.vertTop = std::max(b.vert ? b.fh : 0, u.vert ? h : 0);
      c.boxes.push_back({b.box, b.fw, b.fh, b.d, 0, 0, 0, b.vert});
      c.boxes.push_back({u.box, u.fw, u.fh, u.d, std::max(0, (b.fw - u.fw) / 2), b.fh, 0, u.vert});
      cols.push_back(std::move(c));
    }
  }
  std::stable_sort(cols.begin(), cols.end(), [](const Unit& a, const Unit& b) {
    long long ma = (long long)a.width * a.height - a.faceArea;
    long long mb = (long long)b.width * b.height - b.faceArea;
    return ma * b.width < mb * a.width;  // mismatch density ascending
  });
  if (cols.size() > 3000) cols.resize(3000);
  for (auto& c : cols) units.push_back(std::move(c));
  return units;
}

static Cell cellOf(const std::vector<const Unit*>& parts) {
  Cell c;
  int x = 0;
  for (size_t k = 0; k < parts.size(); k++) {
    const Unit& u = *parts[k];
    c.mask |= u.mask;
    c.height = std::max(c.height, u.height);
    c.vol += u.vol;
    c.faceArea += u.faceArea;
    c.depthSum += u.depthSum;
    c.maxDepth = std::max(c.maxDepth, u.maxDepth);
    c.vertTop = std::max(c.vertTop, u.vertTop);
    for (Placement pl : u.boxes) {
      pl.xOff += x;
      pl.unit = (int)k;
      c.boxes.push_back(pl);
    }
    x += u.width;
  }
  c.width = x;
  return c;
}

static std::vector<Cell> buildCells(const std::vector<Box>& boxes, const std::vector<Orient>& os,
                                    const Params& p) {
  std::vector<Unit> units = buildUnits(boxes, os, p);
  std::vector<Cell> cells;
  for (const Unit& u : units) cells.push_back(cellOf({&u}));
 
  // Side-by-side pairs of units with matching heights (±tol each).
  int hTol = 2 * p.tolPerBox;
  std::vector<int> byH(units.size());
  for (size_t i = 0; i < byH.size(); i++) byH[i] = (int)i;
  std::sort(byH.begin(), byH.end(),
            [&](int a, int b) { return units[a].height < units[b].height; });
  size_t pairStart = cells.size();
  for (size_t i = 0; i < byH.size(); i++) {
    const Unit& a = units[byH[i]];
    for (size_t j = i + 1; j < byH.size(); j++) {
      const Unit& b = units[byH[j]];
      if (b.height - a.height > hTol) break;
      if (a.mask & b.mask) continue;
      if (a.width + b.width > p.maxWidth()) continue;
      cells.push_back(cellOf({&a, &b}));
    }
  }
  size_t pairEnd = cells.size();

  // Triples: single-box units only (wide-pile partners), min combined width.
  std::map<std::pair<uint64_t, int>, size_t> tripleBest;
  for (size_t ci = pairStart; ci < pairEnd; ci++) {
    if (cells[ci].boxes.size() != 2) continue;
    for (const Orient& o : os) {
      const Cell& pc = cells[ci];
      if (pc.mask & (1ULL << o.box)) continue;
      int lo = std::min({pc.boxes[0].fh, pc.boxes[1].fh, o.fh});
      int hi = std::max({pc.boxes[0].fh, pc.boxes[1].fh, o.fh});
      if (hi - lo > hTol) continue;
      int width = pc.width + o.fw;
      if (width > p.maxWidth() || width < 250) continue;
      Cell c = pc;
      c.mask |= 1ULL << o.box;
      c.width = width;
      c.height = std::max(pc.height, o.fh);
      c.vol += boxes[o.box].vol;
      c.depthSum += o.d;
      c.faceArea += (long long)o.fw * o.fh;
      c.maxDepth = std::max(pc.maxDepth, o.d);
      c.vertTop = std::max(pc.vertTop, o.vert ? o.fh : 0);
      c.boxes.push_back({o.box, o.fw, o.fh, o.d, pc.width, 0, 2, o.vert});
      auto key = std::make_pair(c.mask, c.width);
      auto it = tripleBest.find(key);
      if (it == tripleBest.end()) {
        tripleBest[key] = cells.size();
        cells.push_back(std::move(c));
      } else if (c.depthSum > cells[it->second].depthSum) {
        cells[it->second] = std::move(c);
      }
    }
  }

  // Dedup: one cell per (box set, width, height) — the lowest-mismatch one.
  {
    std::stable_sort(cells.begin(), cells.end(), [](const Cell& a, const Cell& b) {
      long long ma = (long long)a.width * a.height - a.faceArea;
      long long mb = (long long)b.width * b.height - b.faceArea;
      return ma * b.width < mb * a.width;
    });
    std::set<std::tuple<uint64_t, int, int>> seen;
    std::vector<Cell> uniq;
    for (auto& c : cells)
      if (seen.insert({c.mask, c.width, c.height}).second) uniq.push_back(std::move(c));
    cells = std::move(uniq);
  }
  // Cap for tractability: bucketed by width AND height class, mismatch
  // density ascending, plus a per-box coverage floor. Height in the bucket
  // key is what keeps the short workhorse cells alive next to tall columns.
  if (cells.size() > 5000) {
    std::vector<char> take(cells.size(), 0);
    std::map<std::pair<int, int>, std::vector<size_t>> byW;
    for (size_t i = 0; i < cells.size(); i++)
      byW[{cells[i].width / 25, cells[i].height / 25}].push_back(i);
    size_t got = 0;
    for (size_t round = 0; got < 5000; round++) {
      bool any = false;
      for (auto& [_, bucket] : byW)
        if (round < bucket.size() && got < 5000) {
          take[bucket[round]] = 1;
          got++;
          any = true;
        }
      if (!any) break;
    }
    std::vector<int> perBox(64, 0);
    for (size_t i = 0; i < cells.size(); i++)
      if (take[i])
        for (int b = 0; b < 64; b++)
          if (cells[i].mask & (1ULL << b)) perBox[b]++;
    for (size_t i = 0; i < cells.size(); i++) {
      if (take[i]) continue;
      bool needed = false;
      for (int b = 0; b < 64 && !needed; b++)
        if ((cells[i].mask & (1ULL << b)) && perBox[b] < 60) needed = true;
      if (!needed) continue;
      take[i] = 1;
      for (int b = 0; b < 64; b++)
        if (cells[i].mask & (1ULL << b)) perBox[b]++;
    }
    std::vector<Cell> kept;
    for (size_t i = 0; i < cells.size(); i++)
      if (take[i]) kept.push_back(std::move(cells[i]));
    cells = std::move(kept);
  }
  return cells;
}

// Enumerate piles: DFS over cells inside a ±width-tolerance window.
/**
 * Standing (rotated) boxes must keep their tops under the nominal line, so
 * cells carrying them sink to the pile bottom. Returns a feasible order of
 * JUST the vert cells (base of each = summed heights of the vert cells below
 * it), or nullopt if none exists.
 */
static bool vertOrderFor(const std::vector<Cell>& cells, const std::vector<int>& vertCells,
                         int heightBase, std::vector<int>& out) {
  std::vector<int> perm = vertCells;
  std::sort(perm.begin(), perm.end());
  do {
    int base = 0;
    bool ok = true;
    for (int ci : perm) {
      if (base + cells[ci].vertTop > heightBase) {
        ok = false;
        break;
      }
      base += cells[ci].height;
    }
    if (ok) {
      out = perm;
      return true;
    }
  } while (std::next_permutation(perm.begin(), perm.end()));
  return false;
}

static std::vector<Pile> buildPiles(const std::vector<Cell>& cells, const Params& p) {
  std::vector<int> order(cells.size());
  for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
  std::sort(order.begin(), order.end(),
            [&](int a, int b) { return cells[a].width > cells[b].width; });

  // Dedup piles by box-set; keep the best (volume, depth, narrower width).
  std::unordered_map<uint64_t, Pile> best;
  const int wTol = 2 * p.tolPerBox + p.widthSlack;
  const size_t PILE_CAP = 500000;

  struct Frame {
    uint64_t mask;
    int height;
    long long vol;
    int depthSum;
    long long faceArea;
    int maxDepth;
    int nLayers;  // stacked cells — height tolerance accrues per LAYER
  };
  std::vector<int> chosen;

  // Budgets: a global cap keeps slack-widened enumeration bounded, and a
  // per-anchor cap stops the widest anchors from starving the narrow ones
  // (narrow piles are what completes shelf widths).
  long long nodeBudget = 400'000'000;
  long long anchorBudget = 0;
  // Fair recording: without a per-anchor cap the widest anchors flood the
  // dedup map to PILE_CAP before narrow anchors (where e.g. the EXIT piles
  // live) ever run — the map fills with mega-piles and the search starves.
  int anchorRecorded = 0;
  std::function<void(size_t, size_t, Frame)> dfs = [&](size_t anchor, size_t idx, Frame f) {
    if (best.size() > PILE_CAP || --nodeBudget < 0 || --anchorBudget < 0) return;
    if (anchorRecorded > 400) return;
    // Record when the pile plausibly reaches the nominal height. Tolerance
    // accrues once per stacked layer (a layer is as tall as its tallest box),
    // so a many-box pile cannot bank per-box slack into extra overshoot.
    if (f.height + f.nLayers * p.tolPerBox >= p.heightBase - p.heightSlack) {
      std::vector<int> vertCells, vo;
      for (int ci : chosen)
        if (cells[ci].vertTop > 0) vertCells.push_back(ci);
      if (!vertCells.empty() && !vertOrderFor(cells, vertCells, p.heightBase, vo)) return;
      int width = cells[order[anchor]].width;
      Pile pile{f.mask, width, f.height, f.vol, f.depthSum, 0, f.maxDepth, {}};
      pile.holes = (long long)width * f.height - f.faceArea +
                   (long long)width * std::max(0, p.heightBase - f.height);
      pile.cells.reserve(chosen.size());
      for (int ci : chosen) pile.cells.push_back(ci);
      auto it = best.find(f.mask);
      if (it == best.end()) {
        best[f.mask] = pile;
        anchorRecorded++;
      } else if (pile.vol > it->second.vol ||
                 (pile.vol == it->second.vol &&
                  (pile.depthSum > it->second.depthSum ||
                   (pile.depthSum == it->second.depthSum && pile.width < it->second.width)))) {
        it->second = pile;
      }
    }
    if ((int)chosen.size() >= 6) return;
    int anchorW = cells[order[anchor]].width;
    for (size_t k = idx; k < order.size(); k++) {
      const Cell& c = cells[order[k]];
      if (c.width < anchorW - wTol) break;  // sorted desc — window ended
      if (c.mask & f.mask) continue;
      int nl = f.nLayers + 1;
      int h = f.height + c.height;
      if (h - nl * p.tolPerBox > p.maxHeight()) continue;
      chosen.push_back(order[k]);
      dfs(anchor, k + 1,
          {f.mask | c.mask, h, f.vol + c.vol, f.depthSum + c.depthSum, f.faceArea + c.faceArea,
           std::max(f.maxDepth, c.maxDepth), nl});
      chosen.pop_back();
    }
  };

  {
    std::map<int, std::vector<size_t>> anchorBuckets;
    for (size_t a = 0; a < order.size(); a++)
      anchorBuckets[cells[order[a]].width / 25].push_back(a);
    std::vector<size_t> anchorSeq;
    for (size_t round = 0;; round++) {
      bool any = false;
      for (auto& [_, bucket] : anchorBuckets)
        if (round < bucket.size()) {
          anchorSeq.push_back(bucket[round]);
          any = true;
        }
      if (!any) break;
    }
    for (size_t a : anchorSeq) {
      const Cell& c = cells[order[a]];
      chosen.assign(1, order[a]);
      anchorBudget = 1'000'000;
      anchorRecorded = 0;
      dfs(a, a + 1, {c.mask, c.height, c.vol, c.depthSum, c.faceArea, c.maxDepth, 1});
    }
  }

  std::vector<Pile> piles;
  piles.reserve(best.size());
  for (auto& [_, pile] : best) piles.push_back(std::move(pile));
  return piles;
}

// ── Global search: beam + randomized greedy over piles ─────────────────
struct State {
  uint64_t mask = 0;
  int width = 0;
  long long vol = 0;
  long long depthSum = 0;
  long long topOver = 0;  // Σ pile width × top overshoot
  std::vector<int> piles;
};

static long long stateScore(const State& s, const Params& p) {
  long long widthOverArea = (long long)std::max(0, s.width - p.widthBase) * p.heightBase;
  long long score = solutionScore(s.vol, widthOverArea, s.topOver, p);
  // Required boxes carry a bonus far above any volume trade-off, so the beam
  // never drops them for ordinary gains.
  score += (long long)__builtin_popcountll(s.mask & p.requiredMask) * 8'000'000LL;
  // A half-included companion group is a dead end (final filter rejects it):
  // nudge the beam toward completing the group or leaving it out entirely.
  for (uint64_t g : p.togetherMasks) {
    uint64_t inter = s.mask & g;
    if (inter && inter != g) score -= 4'000'000LL;
  }
  return score;
}

static bool betterSolution(const Solution& a, const Solution& b) {
  // Both carry precomputed score in `overArea` slot? No — compare on score.
  // (score recomputed by caller into the sort lambda; here: volume tiebreak.)
  if (a.vol != b.vol) return a.vol > b.vol;
  return a.depthSum > b.depthSum;
}

static void collect(std::map<uint64_t, Solution>& pool, const State& s, const Params& p) {
  Solution sol;
  sol.mask = s.mask;
  sol.width = s.width;
  sol.vol = s.vol;
  sol.depthSum = s.depthSum;
  sol.overArea = (long long)std::max(0, s.width - p.widthBase) * p.heightBase + s.topOver;
  sol.piles = s.piles;
  auto it = pool.find(s.mask);
  if (it == pool.end()) {
    pool[s.mask] = std::move(sol);
    return;
  }
  long long a = solutionScore(sol.vol, sol.overArea, 0, p);
  long long b = solutionScore(it->second.vol, it->second.overArea, 0, p);
  if (a > b || (a == b && sol.depthSum > it->second.depthSum)) pool[s.mask] = std::move(sol);
}

static void beamSearch(const std::vector<Pile>& piles, std::vector<int> order, const Params& p,
                       std::map<uint64_t, Solution>& pool, size_t beamWidth) {
  std::vector<State> beam(1);
  for (int pi : order) {
    const Pile& pile = piles[pi];
    std::vector<State> next = beam;
    for (const State& s : beam) {
      if (s.mask & pile.mask) continue;
      if (s.width + pile.width > p.maxWidth()) continue;
      State t = s;
      t.mask |= pile.mask;
      t.width += pile.width;
      t.vol += pile.vol;
      t.depthSum += pile.depthSum;
      t.topOver += topOverArea(pile, p.heightBase);
      t.piles.push_back(pi);
      next.push_back(std::move(t));
    }
    std::sort(next.begin(), next.end(), [&](const State& a, const State& b) {
      long long sa = stateScore(a, p), sb = stateScore(b, p);
      if (sa != sb) return sa > sb;
      return a.depthSum > b.depthSum;
    });
    if (next.size() > beamWidth) next.resize(beamWidth);
    beam = std::move(next);
  }
  for (const State& s : beam)
    if (s.width > 0) collect(pool, s, p);
  (void)piles;
}

static void greedyRestarts(const std::vector<Pile>& piles, const Params& p,
                           std::map<uint64_t, Solution>& pool, int iterations, uint64_t seed) {
  std::mt19937_64 rng(seed);
  std::vector<int> order(piles.size());
  for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
  for (int it = 0; it < iterations; it++) {
    // Density-biased shuffle: sort by noisy volume/width density.
    std::vector<std::pair<double, int>> keyed(order.size());
    std::uniform_real_distribution<double> noise(0.75, 1.25);
    for (size_t i = 0; i < order.size(); i++) {
      const Pile& pile = piles[i];
      double key = -(double)pile.vol / pile.width * noise(rng);
      // Piles carrying required boxes sort first.
      key -= 1e9 * __builtin_popcountll(pile.mask & p.requiredMask);
      keyed[i] = {key, (int)i};
    }
    std::sort(keyed.begin(), keyed.end());
    State s;
    for (auto& [_, pi] : keyed) {
      const Pile& pile = piles[pi];
      if (s.mask & pile.mask) continue;
      if (s.width + pile.width > p.maxWidth()) continue;
      s.mask |= pile.mask;
      s.width += pile.width;
      s.vol += pile.vol;
      s.depthSum += pile.depthSum;
      s.topOver += topOverArea(pile, p.heightBase);
      s.piles.push_back(pi);
    }
    if (s.width > 0) collect(pool, s, p);
  }
}

// ── Layout & required-cluster arrangement ──────────────────────────────
struct PlacedRect {
  int box, fw, fh, d, x0, y0;  // y0 measured up from the floor
  bool vert;
};

// Closed-rectangle contact (shared side or corner). Interiors never overlap
// by construction, so interval intersection in both axes means touching.
static bool touches(const PlacedRect& a, const PlacedRect& b) {
  return a.x0 <= b.x0 + b.fw && b.x0 <= a.x0 + a.fw && a.y0 <= b.y0 + b.fh && b.y0 <= a.y0 + a.fh;
}

/**
 * Gravity: every box drops to its lowest straight resting height — the
 * highest settled top among lower boxes it overlaps in x, or the floor.
 * Boxes stay level (a box on unequal supporters rests on the tallest one,
 * leaving a wedge of air that the hole metric charges honestly).
 */
static void settleLayout(std::vector<PlacedRect>& layout) {
  std::vector<int> idx(layout.size());
  for (size_t i = 0; i < idx.size(); i++) idx[i] = (int)i;
  std::stable_sort(idx.begin(), idx.end(),
                   [&](int a, int b) { return layout[a].y0 < layout[b].y0; });
  for (size_t k = 0; k < idx.size(); k++) {
    PlacedRect& r = layout[idx[k]];
    int rest = 0;
    for (size_t j = 0; j < k; j++) {
      const PlacedRect& o = layout[idx[j]];
      if (std::min(r.x0 + r.fw, o.x0 + o.fw) - std::max(r.x0, o.x0) > 0)
        rest = std::max(rest, o.y0 + o.fh);
    }
    r.y0 = rest;
  }
}

// Does the contact between c and o lie along one of c's LONG edges, with a
// strictly positive shared segment (a corner point does not qualify)?
static bool longEdgeContact(const PlacedRect& c, const PlacedRect& o) {
  if (c.fw >= c.fh) {  // long edges are the horizontal ones
    int ov = std::min(c.x0 + c.fw, o.x0 + o.fw) - std::max(c.x0, o.x0);
    if (ov <= 0) return false;
    return o.y0 + o.fh == c.y0 || c.y0 + c.fh == o.y0;
  }
  int ov = std::min(c.y0 + c.fh, o.y0 + o.fh) - std::max(c.y0, o.y0);
  if (ov <= 0) return false;
  return o.x0 + o.fw == c.x0 || c.x0 + c.fw == o.x0;
}

static std::vector<int> cellOrderByHeight(const Pile& pile, const std::vector<Cell>& cells,
                                          int heightBase) {
  std::vector<int> cs = pile.cells;
  std::sort(cs.begin(), cs.end(), [&](int a, int b) {
    if (cells[a].height != cells[b].height) return cells[a].height > cells[b].height;
    return cells[a].depthSum * (long long)cells[b].boxes.size() >
           cells[b].depthSum * (long long)cells[a].boxes.size();
  });
  // Standing boxes must stay under the nominal line: their cells go to the
  // bottom, ordered by the same feasibility search used at pile build.
  std::vector<int> vertCells, vo;
  for (int ci : cs)
    if (cells[ci].vertTop > 0) vertCells.push_back(ci);
  if (!vertCells.empty() && vertOrderFor(cells, vertCells, heightBase, vo)) {
    std::vector<int> rest;
    for (int ci : cs)
      if (cells[ci].vertTop == 0) rest.push_back(ci);
    cs = vo;
    cs.insert(cs.end(), rest.begin(), rest.end());
  }
  return cs;
}

static int unitCountOf(const Cell& cell) {
  int n = 0;
  for (const Placement& pl : cell.boxes) n = std::max(n, pl.unit + 1);
  return n;
}

static int unitLeftOf(const Cell& cell, int u) {
  int lo = 1 << 30;
  for (const Placement& pl : cell.boxes)
    if (pl.unit == u) lo = std::min(lo, pl.xOff);
  return lo;
}

static int unitWidthOf(const Cell& cell, int u) {
  int lo = unitLeftOf(cell, u), w = 0;
  for (const Placement& pl : cell.boxes)
    if (pl.unit == u) w = std::max(w, pl.xOff - lo + pl.fw);
  return w;
}

/**
 * Cells narrower than the pile push their mismatch slack toward the nearer
 * shelf edge: the leftmost pile fully left, the rightmost fully right, and
 * interior piles by half-rule. Edge slack lands in the overhang, where the
 * nominal window can slide off it entirely. Units are emitted in
 * `unitOrderOf` order (permutable); a unit's boxes keep their internal
 * column layout, including stacked yOff.
 */
static void emitPile(const Pile& pile, const std::vector<Cell>& cells,
                     const std::vector<int>& cellOrder,
                     const std::function<std::vector<int>(int)>& unitOrderOf, int x, int solWidth,
                     std::vector<PlacedRect>& out) {
  bool slackLeft = x == 0                          ? true
                   : x + pile.width == solWidth ? false
                                                : 2 * x + pile.width < solWidth;
  int y = 0;
  for (int ci : cellOrder) {
    const Cell& cell = cells[ci];
    int xOff = slackLeft ? pile.width - cell.width : 0;
    for (int u : unitOrderOf(ci)) {
      int lo = unitLeftOf(cell, u);
      for (const Placement& pl : cell.boxes)
        if (pl.unit == u)
          out.push_back(
              {pl.box, pl.fw, pl.fh, pl.d, x + xOff + (pl.xOff - lo), y + pl.yOff, pl.vert});
      xOff += unitWidthOf(cell, u);
    }
    y += cell.height;
  }
}

static std::vector<int> identityUnitOrder(const Cell& cell) {
  std::vector<int> o(unitCountOf(cell));
  for (size_t i = 0; i < o.size(); i++) o[i] = (int)i;
  return o;
}

/**
 * Holes INSIDE the nominal widthBase x heightBase window, minimized over the
 * window's position along the layout (the layout may overhang each side by
 * the overflow allowance, so edge slack can escape the window entirely).
 */
static long long interiorHolesOf(const std::vector<PlacedRect>& layout, int W, const Params& p,
                                 int& bestOffset) {
  int aLo = std::max(0, W - p.widthBase - p.overRight);
  int aHi = std::min(p.overLeft, std::max(0, W - p.widthBase));
  long long best = -1;
  bestOffset = 0;
  for (int a = aLo; a <= aHi; a++) {
    long long covered = 0;
    for (const PlacedRect& r : layout) {
      int x0 = std::max(r.x0, a), x1 = std::min(r.x0 + r.fw, a + p.widthBase);
      int y1 = std::min(r.y0 + r.fh, p.heightBase);
      if (x1 > x0 && y1 > r.y0) covered += (long long)(x1 - x0) * (y1 - r.y0);
    }
    long long holes = (long long)p.widthBase * p.heightBase - covered;
    if (best < 0 || holes < best) {
      best = holes;
      bestOffset = a;
    }
  }
  return best;
}

/**
 * Produce a concrete layout for a solution and prove its cluster constraints.
 * Clusters = the --require set plus every fully-present --together group.
 * Cluster-carrying piles are grouped into consecutive blocks (clusters that
 * share a pile merge into one block), cluster cells sink to the pile bottoms,
 * and we enumerate pile order within blocks plus box order inside
 * cluster-carrying side-by-side cells until EVERY cluster passes the
 * geometric touching check. Also rejects half-included companion groups.
 */
static bool arrangeSolution(const Solution& sol, const std::vector<Pile>& piles,
                            const std::vector<Cell>& cells, const Params& p,
                            std::vector<PlacedRect>& out, int* windowOffset = nullptr,
                            long long* interiorOut = nullptr) {
  // Hard membership rules first.
  if (p.requiredMask && (sol.mask & p.requiredMask) != p.requiredMask) return false;
  for (uint64_t g : p.togetherMasks) {
    uint64_t inter = sol.mask & g;
    if (inter && inter != g) return false;  // all-or-none
  }
  for (auto& [dep, prov] : p.companions)
    if ((sol.mask & dep) && !(sol.mask & prov)) return false;

  std::vector<uint64_t> clusters;
  std::vector<char> clusterMutual;  // 1 = every contact long-edge for BOTH boxes
  if (p.requiredMask) {
    clusters.push_back(p.requiredMask);
    clusterMutual.push_back(0);
  }
  for (uint64_t g : p.togetherMasks)
    if ((sol.mask & g) == g) {
      clusters.push_back(g);
      clusterMutual.push_back(0);
    }
  for (auto& [dep, prov] : p.companions)
    if ((sol.mask & (dep | prov)) == (dep | prov)) {
      clusters.push_back(dep | prov);
      clusterMutual.push_back(1);
    }

  uint64_t clusterUnion = 0;
  for (uint64_t g : clusters) clusterUnion |= g;

  auto defaultBoxOrder = [&](int ci) { return identityUnitOrder(cells[ci]); };

  std::vector<int> freePiles, clusterPiles;
  for (int pi : sol.piles)
    ((piles[pi].mask & clusterUnion) ? clusterPiles : freePiles).push_back(pi);
  std::sort(freePiles.begin(), freePiles.end(),
            [&](int a, int b) { return piles[a].width > piles[b].width; });

  if (!clusters.empty() && clusterPiles.empty()) return false;

  // Blocks: clusters sharing a pile merge (their piles must interleave).
  size_t nc = clusters.size();
  std::vector<int> cparent(nc);
  for (size_t i = 0; i < nc; i++) cparent[i] = (int)i;
  std::function<int(int)> cfind = [&](int v) {
    return cparent[v] == v ? v : cparent[v] = cfind(cparent[v]);
  };
  for (int pi : clusterPiles) {
    int first = -1;
    for (size_t c = 0; c < nc; c++)
      if (piles[pi].mask & clusters[c]) {
        if (first < 0) first = (int)c;
        else cparent[cfind((int)c)] = cfind(first);
      }
  }
  std::map<int, std::vector<int>> blockPiles;  // block root → its piles
  for (int pi : clusterPiles) {
    for (size_t c = 0; c < nc; c++)
      if (piles[pi].mask & clusters[c]) {
        blockPiles[cfind((int)c)].push_back(pi);
        break;
      }
  }

  // Cluster cells sink to the pile bottom.
  auto clusterCellOrder = [&](const Pile& pile) {
    std::vector<int> cs = cellOrderByHeight(pile, cells, p.heightBase);
    // Rank: standing cells stay at the very bottom (hard constraint), then
    // cluster cells (adjacency), then the rest.
    auto rank = [&](int ci) {
      if (cells[ci].vertTop > 0) return 0;
      return (cells[ci].mask & clusterUnion) ? 1 : 2;
    };
    std::stable_sort(cs.begin(), cs.end(), [&](int a, int b) { return rank(a) < rank(b); });
    return cs;
  };

  // Box-order permutations for cluster-carrying side-by-side cells.
  struct PermCell {
    int ci;
    std::vector<std::vector<int>> perms;
  };
  std::vector<PermCell> permCells;
  std::set<int> permSeen;
  auto addPermCell = [&](int ci) {
    const Cell& cell = cells[ci];
    if (unitCountOf(cell) < 2 || permSeen.count(ci)) return;
    permSeen.insert(ci);
    PermCell pc{ci, {}};
    std::vector<int> order = identityUnitOrder(cell);
    do {
      pc.perms.push_back(order);
    } while (std::next_permutation(order.begin(), order.end()));
    permCells.push_back(std::move(pc));
  };
  for (int pi : clusterPiles)
    for (int ci : piles[pi].cells)
      if (cells[ci].mask & clusterUnion) addPermCell(ci);
  // Support repair: piles holding a cell whose units differ in height leave
  // dips; every multi-unit cell of such a pile becomes permutable so a
  // full-height supporter can be shuffled under a floating box above.
  for (int pi : sol.piles) {
    bool mismatch = false;
    for (int ci : piles[pi].cells) {
      const Cell& cell = cells[ci];
      for (const Placement& pl : cell.boxes)
        if (pl.yOff + pl.fh < cell.height) mismatch = true;
    }
    if (!mismatch) continue;
    for (int ci : piles[pi].cells) addPermCell(ci);
  }

  std::vector<std::vector<int>> blocks;
  for (auto& [_, bp] : blockPiles) {
    std::sort(bp.begin(), bp.end());
    blocks.push_back(bp);
  }

  long long tries = 0;
  std::vector<PlacedRect> layout;

  // Units: free piles individually + each block as an unmovable run. The
  // final order is chosen to minimize interior holes: try edge-pair
  // placements ranked by a quick unverified layout, then verify clusters.
  size_t nFree = freePiles.size(), nUnits = nFree + blocks.size();
  std::vector<int> unitOrder(nUnits);
  auto seqOf = [&](const std::vector<int>& uo) {
    std::vector<int> seq;
    for (int u : uo) {
      if (u < (int)nFree) seq.push_back(freePiles[u]);
      else
        for (int pi : blocks[u - nFree]) seq.push_back(pi);
    }
    return seq;
  };
  auto emitSeq = [&](const std::vector<int>& seq,
                     const std::function<std::vector<int>(int)>& boxOrderOf,
                     std::vector<PlacedRect>& lo) {
    lo.clear();
    int x = 0;
    for (int pi : seq) {
      bool isCluster = (piles[pi].mask & clusterUnion) != 0;
      emitPile(piles[pi], cells,
               isCluster ? clusterCellOrder(piles[pi])
                          : cellOrderByHeight(piles[pi], cells, p.heightBase),
               boxOrderOf, x, sol.width, lo);
      x += piles[pi].width;
    }
  };

  auto testArrangement = [&](void) -> bool {
    std::vector<size_t> counter(permCells.size(), 0);
    while (true) {
      if (++tries > 100000) return false;
      auto boxOrderOf = [&](int ci) {
        for (size_t k = 0; k < permCells.size(); k++)
          if (permCells[k].ci == ci) return permCells[k].perms[counter[k]];
        return identityUnitOrder(cells[ci]);
      };
      emitSeq(seqOf(unitOrder), boxOrderOf, layout);
      // Gravity first: boxes settle to their true resting heights. Then:
      // standing boxes must not poke above the nominal line, and every
      // cluster must be internally connected ON THE SETTLED geometry.
      settleLayout(layout);
      bool allOk = true;
      for (const PlacedRect& r : layout)
        if (r.vert && r.y0 + r.fh > p.heightBase) allOk = false;
      for (size_t ci = 0; ci < clusters.size(); ci++) {
        if (!allOk) break;
        uint64_t g = clusters[ci];
        bool mutual = clusterMutual[ci];
        std::vector<int> idx;
        for (size_t i = 0; i < layout.size(); i++)
          if (g & (1ULL << layout[i].box)) idx.push_back((int)i);
        std::vector<int> parent(idx.size());
        for (size_t i = 0; i < parent.size(); i++) parent[i] = (int)i;
        std::function<int(int)> find = [&](int v) {
          return parent[v] == v ? v : parent[v] = find(parent[v]);
        };
        auto edgeOk = [&](const PlacedRect& A, const PlacedRect& B) {
          if (mutual) return longEdgeContact(A, B) && longEdgeContact(B, A);
          bool aC = p.longEdgeMask & (1ULL << A.box), bC = p.longEdgeMask & (1ULL << B.box);
          if (aC && !longEdgeContact(A, B)) return false;
          if (bC && !longEdgeContact(B, A)) return false;
          return aC || bC ? true : touches(A, B);
        };
        for (size_t i = 0; i < idx.size(); i++)
          for (size_t j = i + 1; j < idx.size(); j++)
            if (edgeOk(layout[idx[i]], layout[idx[j]])) parent[find((int)i)] = find((int)j);
        for (size_t i = 1; i < idx.size(); i++)
          if (find((int)i) != find(0)) allOk = false;
        if (!allOk) break;
      }
      if (allOk) return true;
      if (permCells.empty()) return false;
      size_t k = 0;
      for (; k < counter.size(); k++) {
        if (++counter[k] < permCells[k].perms.size()) break;
        counter[k] = 0;
      }
      if (k == counter.size()) return false;
    }
  };

  // Odometer over per-block pile permutations.
  std::function<bool(size_t)> permuteBlocks = [&](size_t bi) -> bool {
    if (tries > 100000) return false;
    if (bi == blocks.size()) return testArrangement();
    std::vector<int>& block = blocks[bi];
    std::sort(block.begin(), block.end());
    do {
      if (permuteBlocks(bi + 1)) return true;
      if (tries > 100000) return false;
    } while (std::next_permutation(block.begin(), block.end()));
    return false;
  };

  // Rank candidate unit orders by unverified interior holes.
  std::vector<int> baseOrder(nUnits);
  for (size_t i = 0; i < nUnits; i++) baseOrder[i] = (int)i;
  std::vector<std::pair<long long, std::vector<int>>> cands;
  auto scoreOrder = [&](const std::vector<int>& uo) {
    std::vector<PlacedRect> lo;
    emitSeq(seqOf(uo), defaultBoxOrder, lo);
    settleLayout(lo);
    int off = 0;
    cands.push_back({interiorHolesOf(lo, sol.width, p, off), uo});
  };
  scoreOrder(baseOrder);
  for (size_t l = 0; l < nUnits && nUnits > 1; l++)
    for (size_t r = 0; r < nUnits; r++) {
      if (l == r) continue;
      std::vector<int> uo;
      uo.push_back((int)l);
      for (size_t k = 0; k < nUnits; k++)
        if (k != l && k != r) uo.push_back((int)k);
      uo.push_back((int)r);
      scoreOrder(uo);
    }
  std::stable_sort(cands.begin(), cands.end(),
                   [](const auto& a, const auto& b) { return a.first < b.first; });

  size_t tried = 0;
  for (auto& [_, uo] : cands) {
    if (++tried > 16 || tries > 100000) break;
    unitOrder = uo;
    if (permuteBlocks(0)) {
      out = layout;
      int off = 0;
      long long holes = interiorHolesOf(layout, sol.width, p, off);
      if (windowOffset) *windowOffset = off;
      if (interiorOut) *interiorOut = holes;
      return true;
    }
  }
  return false;
}

// ── PNG writer (truecolor, uncompressed deflate — no dependencies) ─────
namespace png {
static uint32_t crcTable[256];
static void initCrc() {
  for (uint32_t n = 0; n < 256; n++) {
    uint32_t c = n;
    for (int k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
    crcTable[n] = c;
  }
}
static uint32_t crc(const uint8_t* buf, size_t len, uint32_t c = 0xFFFFFFFFu) {
  for (size_t i = 0; i < len; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >> 8);
  return c;
}
static void be32(std::vector<uint8_t>& v, uint32_t x) {
  v.push_back(x >> 24), v.push_back(x >> 16), v.push_back(x >> 8), v.push_back(x);
}
static void chunk(std::vector<uint8_t>& out, const char* type, const std::vector<uint8_t>& data) {
  be32(out, (uint32_t)data.size());
  size_t start = out.size();
  out.insert(out.end(), type, type + 4);
  out.insert(out.end(), data.begin(), data.end());
  uint32_t c = crc(out.data() + start, out.size() - start) ^ 0xFFFFFFFFu;
  be32(out, c);
}
static void write(const std::string& path, int W, int H, const std::vector<uint8_t>& rgb) {
  initCrc();
  std::vector<uint8_t> out = {0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
  std::vector<uint8_t> ihdr;
  be32(ihdr, W), be32(ihdr, H);
  ihdr.push_back(8), ihdr.push_back(2);  // 8-bit, truecolor
  ihdr.push_back(0), ihdr.push_back(0), ihdr.push_back(0);
  chunk(out, "IHDR", ihdr);

  // Raw scanlines with filter byte 0.
  std::vector<uint8_t> raw;
  raw.reserve((size_t)H * (W * 3 + 1));
  for (int y = 0; y < H; y++) {
    raw.push_back(0);
    raw.insert(raw.end(), rgb.begin() + (size_t)y * W * 3, rgb.begin() + (size_t)(y + 1) * W * 3);
  }
  // zlib stream with stored (uncompressed) deflate blocks.
  std::vector<uint8_t> z = {0x78, 0x01};
  size_t pos = 0;
  while (pos < raw.size()) {
    size_t n = std::min<size_t>(65535, raw.size() - pos);
    bool last = pos + n == raw.size();
    z.push_back(last ? 1 : 0);
    z.push_back(n & 0xFF), z.push_back(n >> 8);
    z.push_back(~n & 0xFF), z.push_back((~n >> 8) & 0xFF);
    z.insert(z.end(), raw.begin() + pos, raw.begin() + pos + n);
    pos += n;
  }
  uint32_t a = 1, b = 0;
  for (uint8_t byte : raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  be32(z, (b << 16) | a);
  chunk(out, "IDAT", z);
  chunk(out, "IEND", {});
  std::ofstream f(path, std::ios::binary);
  f.write((const char*)out.data(), (std::streamsize)out.size());
}
}  // namespace png

// ── Tiny 5×7 font for labels ───────────────────────────────────────────
static const char* FONT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-. X";
static const uint8_t FONT[40][7] = {
    {0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11}, {0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E},
    {0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E}, {0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E},
    {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F}, {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10},
    {0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F}, {0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11},
    {0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E}, {0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0E},
    {0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11}, {0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F},
    {0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11}, {0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11},
    {0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}, {0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10},
    {0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D}, {0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11},
    {0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E}, {0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04},
    {0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}, {0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04},
    {0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11}, {0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11},
    {0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04}, {0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F},
    {0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E}, {0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E},
    {0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F}, {0x0E, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0E},
    {0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02}, {0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E},
    {0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E}, {0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08},
    {0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E}, {0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C},
    {0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00}, {0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C},
    {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, {0x00, 0x0A, 0x04, 0x0A, 0x00, 0x00, 0x00}};

struct Canvas {
  int W, H;
  std::vector<uint8_t> rgb;
  Canvas(int w, int h) : W(w), H(h), rgb((size_t)w * h * 3, 255) {}
  void px(int x, int y, int r, int g, int b) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    size_t i = ((size_t)y * W + x) * 3;
    rgb[i] = (uint8_t)r, rgb[i + 1] = (uint8_t)g, rgb[i + 2] = (uint8_t)b;
  }
  void fill(int x0, int y0, int x1, int y1, int r, int g, int b) {
    for (int y = y0; y < y1; y++)
      for (int x = x0; x < x1; x++) px(x, y, r, g, b);
  }
  void rect(int x0, int y0, int x1, int y1, int r, int g, int b) {
    for (int x = x0; x < x1; x++) px(x, y0, r, g, b), px(x, y1 - 1, r, g, b);
    for (int y = y0; y < y1; y++) px(x0, y, r, g, b), px(x1 - 1, y, r, g, b);
  }
  void dashedH(int x0, int x1, int y, int r, int g, int b) {
    for (int x = x0; x < x1; x++)
      if ((x / 5) % 2 == 0) px(x, y, r, g, b);
  }
  void dashedV(int x, int y0, int y1, int r, int g, int b) {
    for (int y = y0; y < y1; y++)
      if ((y / 5) % 2 == 0) px(x, y, r, g, b);
  }
  void text(int x, int y, const std::string& s, int r, int g, int b, int scale = 1) {
    int cx = x;
    for (char raw : s) {
      char ch = (char)toupper((unsigned char)raw);
      const char* pos = strchr(FONT_CHARS, ch);
      int gi = pos ? (int)(pos - FONT_CHARS) : 38;  // default: blank
      for (int row = 0; row < 7; row++)
        for (int col = 0; col < 5; col++)
          if (FONT[gi][row] & (1 << (4 - col)))
            for (int sy = 0; sy < scale; sy++)
              for (int sx = 0; sx < scale; sx++)
                px(cx + col * scale + sx, y + row * scale + sy, r, g, b);
      cx += 6 * scale;
    }
  }
};

static void hsv2rgb(double hue, double s, double v, int& r, int& g, int& b) {
  double c = v * s, x = c * (1 - std::abs(std::fmod(hue / 60.0, 2.0) - 1)), m = v - c;
  double rr = 0, gg = 0, bb = 0;
  if (hue < 60) rr = c, gg = x;
  else if (hue < 120) rr = x, gg = c;
  else if (hue < 180) gg = c, bb = x;
  else if (hue < 240) gg = x, bb = c;
  else if (hue < 300) rr = x, bb = c;
  else rr = c, bb = x;
  r = (int)((rr + m) * 255), g = (int)((gg + m) * 255), b = (int)((bb + m) * 255);
}

static void renderSolution(const Solution& sol, const std::vector<PlacedRect>& layout,
                           const std::vector<Box>& boxes, const Params& p,
                           const std::string& path, int rank, int windowOffset = 0,
                           const std::vector<std::string>& extraLegend = {},
                           const std::string& titleSuffix = "") {
  int nPlaced = __builtin_popcountll(sol.mask);
  const int LEGEND_COLS = 3;
  int legendRows = (nPlaced + (int)extraLegend.size() + LEGEND_COLS - 1) / LEGEND_COLS;
  const int M = 40, TITLE = 26, LEGEND_ROW_H = 11;
  int legendH = legendRows * LEGEND_ROW_H + 18;
  int W = std::max(p.maxWidth() + 2 * M, 1020);
  int H = p.maxHeight() + 2 * M + TITLE + legendH;
  Canvas cv(W, H);
  int baseY = H - M - legendH;  // floor line (y grows downward)
  std::vector<std::string> legend;

  // The nominal window sits at layout coord `windowOffset`; canvas M is the
  // window's left edge, so the layout origin lands at M - offset.
  int x0 = M - windowOffset;

  for (const PlacedRect& r : layout) {
    int bx = x0 + r.x0, by = baseY - r.y0 - r.fh;
    int cr, cg, cb;
    hsv2rgb(std::fmod(47.0 * r.box, 360.0), 0.35, 0.95, cr, cg, cb);
    cv.fill(bx, by, bx + r.fw, baseY - r.y0, cr, cg, cb);
    cv.rect(bx, by, bx + r.fw, baseY - r.y0, 60, 60, 60);
    int num = (int)legend.size() + 1;
    char entry[160];
    snprintf(entry, sizeof entry, "%2d %s %dx%d d%d (box %dx%dx%d)", num,
             boxes[r.box].name.c_str(), r.fw, r.fh, r.d, boxes[r.box].w, boxes[r.box].l,
             boxes[r.box].h);
    legend.push_back(entry);
    char numText[16];
    snprintf(numText, sizeof numText, "%d", num);
    std::string name = boxes[r.box].name;
    char dims[64];
    snprintf(dims, sizeof dims, "%dx%d d%d", r.fw, r.fh, r.d);
    int nameW = 6 * (int)(name.size() + strlen(numText) + 1);
    if (r.fh >= 22 && r.fw >= nameW + 8) {
      cv.text(bx + 4, by + 3, std::string(numText) + " " + name, 30, 30, 30);
      cv.text(bx + 4, by + 13, dims, 90, 90, 90);
    } else if (r.fh >= 11 && r.fw >= nameW + 8) {
      cv.text(bx + 4, by + 2, std::string(numText) + " " + name, 30, 30, 30);
    } else {
      int tw = 6 * (int)strlen(numText);
      cv.text(bx + (r.fw - tw) / 2, by + std::max(1, (r.fh - 7) / 2), numText, 30, 30, 30);
    }
  }

  // Guides ON TOP of the boxes so they stay visible: shelf edges (solid
  // grey), overflow allowance (dashed red), floor (solid black).
  cv.rect(M, baseY - p.heightBase, M + p.widthBase, baseY + 1, 90, 90, 90);
  cv.dashedH(M - p.overLeft, M + p.widthBase + p.overRight, baseY - p.maxHeight(), 200, 40, 40);
  cv.dashedV(M - p.overLeft, baseY - p.maxHeight(), baseY, 200, 40, 40);
  cv.dashedV(M + p.widthBase + p.overRight, baseY - p.maxHeight(), baseY, 200, 40, 40);
  cv.fill(M - p.overLeft, baseY, M + p.widthBase + p.overRight, baseY + 3, 0, 0, 0);

  char title[200];
  snprintf(title, sizeof title,
           "SOLUTION %d%s  VOL %.1f L  WIDTH %d MM  BOXES %d  AVG DEPTH %lld MM", rank,
           titleSuffix.c_str(), (double)sol.vol / 1e6, sol.width, nPlaced,
           sol.depthSum / std::max(1, nPlaced));
  cv.text(M, 12, title, 20, 20, 20, 2);

  for (const std::string& e : extraLegend) legend.push_back(e);
  int ly0 = baseY + 16;
  int colW = (W - 2 * M) / LEGEND_COLS;
  for (size_t i = 0; i < legend.size(); i++) {
    int col = (int)i / legendRows, row = (int)i % legendRows;
    cv.text(M + col * colW, ly0 + row * LEGEND_ROW_H, legend[i], 40, 40, 40);
  }
  png::write(path, W, H, cv.rgb);
}

// ── Report ─────────────────────────────────────────────────────────────
static void report(std::ostream& os, const Solution& sol, const std::vector<Pile>& piles,
                   const std::vector<Cell>& cells, const std::vector<Box>& boxes, int rank) {
  os << "── Solution " << rank << ": volume " << (double)sol.vol / 1e6 << " L, width " << sol.width
     << " mm, boxes " << __builtin_popcountll(sol.mask) << ", avg depth "
     << sol.depthSum / std::max(1, (int)__builtin_popcountll(sol.mask))
     << " mm, reserve spill " << (double)sol.overArea / 100.0 << " cm2\n";
  std::vector<int> ordered = sol.piles;
  std::sort(ordered.begin(), ordered.end(),
            [&](int a, int b) { return piles[a].width > piles[b].width; });
  for (int pi : ordered) {
    const Pile& pile = piles[pi];
    os << "  pile w=" << pile.width << " h=" << pile.height << ":";
    for (int ci : pile.cells) {
      const Cell& cell = cells[ci];
      os << " [";
      for (int u = 0; u < unitCountOf(cell); u++) {
        if (u) os << " | ";
        bool first = true;
        for (const Placement& pl : cell.boxes) {
          if (pl.unit != u) continue;
          if (!first) os << " + ";
          first = false;
          os << boxes[pl.box].name << " " << pl.fw << "x" << pl.fh << " d" << pl.d;
        }
      }
      os << "]";
    }
    os << "\n";
  }
  os << "  left out:";
  bool any = false;
  for (size_t i = 0; i < boxes.size(); i++)
    if (!(sol.mask & (1ULL << i))) {
      os << " " << boxes[i].name;
      any = true;
    }
  if (!any) os << " (none)";
  os << "\n\n";
}

// ── Fill-all mode: two shelves completely filled, minimal mismatch holes ─
//
// Criteria (strict order):
//   1. binary  — both rectangles completely filled: total width >= nominal,
//                every pile reaches nominal height (already enforced). Boxes
//                that don't make the cut simply stay out — packing every
//                game is provably impossible (the five 297x297 boxes alone
//                cannot all complete piles).
//   2. minimize — mismatch holes: for each pile, rect area minus the summed
//                face areas of its members (captures the +-1 mm tolerance
//                slivers too). Reserve spill is the tie-break after holes.

struct ShelfSet {
  Params prm;               // per-shelf params (depthMax differs)
  std::vector<Orient> orients;
  std::vector<Cell> cells;
  std::vector<Pile> piles;
};

struct TwoSol {
  uint64_t maskA = 0, maskB = 0;
  int wA = 0, wB = 0;
  long long holes = 0, spill = 0, vol = 0, depthSum = 0;
  std::vector<int> pA, pB;
};

struct TwoState {
  uint64_t maskA = 0, maskB = 0;
  int wA = 0, wB = 0;
  long long holes = 0, topOver = 0;
  std::vector<int> pA, pB;  // pile indices per shelf
};

static bool clusterFrontOk(uint64_t maskA, uint64_t maskB, const Params& p) {
  // The required cluster and every companion group must live wholly in ONE
  // shelf's FRONT row (hidden boxes can't visibly touch).
  if (p.requiredMask) {
    if ((maskA & p.requiredMask) != p.requiredMask && (maskB & p.requiredMask) != p.requiredMask)
      return false;
  }
  for (uint64_t g : p.togetherMasks) {
    if (((maskA | maskB) & g) == 0) continue;  // all-or-none: absent is fine
    if ((maskA & g) != g && (maskB & g) != g) return false;
  }
  for (auto& [dep, prov] : p.companions) {
    if (!((maskA | maskB) & dep)) continue;  // dependent absent: fine
    uint64_t shelf = (maskA & dep) ? maskA : maskB;
    if (!(shelf & prov)) return false;  // provider missing or on the other shelf
  }
  return true;
}

static long long gIncomplete = 0, gCluster = 0, gMissingBoxes = 0, gOk = 0;
int gBestA = 0, gBestB = 0;
uint64_t gBestPlacedMask = 0;
int gBestPlaced = -1;
std::vector<int> gBestPilesA, gBestPilesB;

static void collectTwo(std::map<std::pair<uint64_t, uint64_t>, TwoSol>& pool, const TwoState& s,
                       const ShelfSet sets[2], const std::vector<Box>& boxes, uint64_t allMask,
                       const Params& p, const std::vector<int>& shelfDepths) {
  if (s.wA < p.widthBase || s.wB < p.widthBase) {
    gIncomplete++;
    extern int gBestA, gBestB;
    if (std::min(s.wA, p.widthBase) + std::min(s.wB, p.widthBase) >
        std::min(gBestA, p.widthBase) + std::min(gBestB, p.widthBase)) {
      gBestA = s.wA;
      gBestB = s.wB;
      extern std::vector<int> gBestPilesA, gBestPilesB;
      gBestPilesA.clear();
      for (int pi : s.pA) gBestPilesA.push_back(sets[0].piles[pi].width);
      gBestPilesB.clear();
      for (int pi : s.pB) gBestPilesB.push_back(sets[1].piles[pi].width);
    }
    return;
  }
  if (!clusterFrontOk(s.maskA, s.maskB, p)) {
    gCluster++;
    return;
  }
  if (p.useAll) {
    uint64_t placed = s.maskA | s.maskB;
    int n = __builtin_popcountll(placed);
    if (n > gBestPlaced) {
      gBestPlaced = n;
      gBestPlacedMask = placed;
    }
    if (placed != allMask) {
      gMissingBoxes++;
      return;
    }
  }
  (void)boxes;
  (void)allMask;
  (void)shelfDepths;
  gOk++;
  TwoSol sol;
  sol.maskA = s.maskA;
  sol.maskB = s.maskB;
  sol.wA = s.wA;
  sol.wB = s.wB;
  sol.holes = s.holes;
  sol.spill = (long long)(s.wA - p.widthBase + s.wB - p.widthBase) * p.heightBase + s.topOver;
  for (int sh = 0; sh < 2; sh++)
    for (int pi : (sh == 0 ? s.pA : s.pB)) {
      const Pile& pile = sets[sh].piles[pi];
      sol.vol += pile.vol;
      sol.depthSum += pile.depthSum;
    }
  sol.pA = s.pA;
  sol.pB = s.pB;
  auto key = std::make_pair(s.maskA, s.maskB);
  auto it = pool.find(key);
  if (it == pool.end() || sol.holes < it->second.holes ||
      (sol.holes == it->second.holes && sol.spill < it->second.spill))
    pool[key] = std::move(sol);
}

static long long twoScore(const TwoState& s, const Params& p) {
  long long covered = std::min(s.wA, p.widthBase) + std::min(s.wB, p.widthBase);
  long long score = covered * 1'000'000LL - s.holes * 800 - s.topOver * 2;
  if (p.useAll) score += (long long)__builtin_popcountll(s.maskA | s.maskB) * 3'000'000LL;
  uint64_t front = s.maskA | s.maskB;
  uint64_t rA = s.maskA & p.requiredMask, rB = s.maskB & p.requiredMask;
  score += (long long)__builtin_popcountll(front & p.requiredMask) * 6'000'000LL;
  if (rA && rB) score -= 50'000'000LL;  // cluster split across shelves = fatal
  for (uint64_t g : p.togetherMasks) {
    uint64_t fA = s.maskA & g, fB = s.maskB & g;
    if (fA && fB) score -= 30'000'000LL;
    else {
      uint64_t inter = fA | fB;
      if (inter && inter != g) score -= 2'000'000LL;
      if (inter == g) score += 4'000'000LL;
    }
  }
  for (auto& [dep, prov] : p.companions) {
    if (!((s.maskA | s.maskB) & dep)) continue;
    uint64_t shelf = (s.maskA & dep) ? s.maskA : s.maskB;
    if (!(shelf & prov)) score -= 8'000'000LL;
  }
  return score;
}

static void twoBeam(const ShelfSet sets[2], const std::vector<std::pair<int, int>>& order,
                    const Params& p, const std::vector<Box>& boxes, uint64_t allMask,
                    const std::vector<int>& shelfDepths,
                    std::map<std::pair<uint64_t, uint64_t>, TwoSol>& pool, size_t beamWidth,
                    const TwoState& init = {}) {
  std::vector<TwoState> beam(1, init);
  for (auto [sh, pi] : order) {
    const Pile& pile = sets[sh].piles[pi];
    std::vector<TwoState> next = beam;
    for (const TwoState& s : beam) {
      uint64_t used = s.maskA | s.maskB;
      if (used & pile.mask) continue;
      int w = sh == 0 ? s.wA : s.wB;
      if (w + pile.width > p.maxWidth()) continue;
      TwoState t = s;
      (sh == 0 ? t.maskA : t.maskB) |= pile.mask;
      (sh == 0 ? t.wA : t.wB) += pile.width;
      t.holes += pile.holes;
      t.topOver += topOverArea(pile, p.heightBase);
      (sh == 0 ? t.pA : t.pB).push_back(pi);
      next.push_back(std::move(t));
    }
    std::sort(next.begin(), next.end(), [&](const TwoState& a, const TwoState& b) {
      return twoScore(a, p) > twoScore(b, p);
    });
    if (next.size() > beamWidth) next.resize(beamWidth);
    beam = std::move(next);
  }
  for (const TwoState& s : beam) collectTwo(pool, s, sets, boxes, allMask, p, shelfDepths);
}

static void twoGreedy(const ShelfSet sets[2], const Params& p, const std::vector<Box>& boxes,
                      uint64_t allMask, const std::vector<int>& shelfDepths,
                      std::map<std::pair<uint64_t, uint64_t>, TwoSol>& pool, int iterations,
                      uint64_t seed) {
  std::mt19937_64 rng(seed);
  std::vector<std::pair<int, int>> cands;
  for (int sh = 0; sh < 2; sh++)
    for (size_t i = 0; i < sets[sh].piles.size(); i++) cands.push_back({sh, (int)i});
  std::uniform_real_distribution<double> noise(0.7, 1.3);
  for (int it = 0; it < iterations; it++) {
    int reqShelf = (int)(rng() & 1);
    std::vector<int> togShelf(p.togetherMasks.size());
    for (auto& ts : togShelf) ts = (int)(rng() & 1);
    std::vector<std::pair<double, int>> keyed(cands.size());
    for (size_t i = 0; i < cands.size(); i++) {
      const Pile& pile = sets[cands[i].first].piles[cands[i].second];
      // Cleanest piles (fewest holes per mm of width) first, with noise.
      double key = (double)(pile.holes + 200) / pile.width * noise(rng);
      key /= 1.0 + 0.15 * __builtin_popcountll(pile.mask & p.requiredMask);
      if (p.useAll) key /= 1.0 + 0.1 * __builtin_popcountll(pile.mask);
      for (uint64_t g : p.togetherMasks)
        if (pile.mask & g) key /= 1.2;
      keyed[i] = {key, (int)i};
    }
    std::sort(keyed.begin(), keyed.end());
    TwoState s;
    for (auto& [_, ci] : keyed) {
      auto [sh, pi] = cands[ci];
      const Pile& pile = sets[sh].piles[pi];
      if ((s.maskA | s.maskB) & pile.mask) continue;
      // Cluster piles only go to their designated shelf this restart.
      if ((pile.mask & p.requiredMask) && sh != reqShelf) continue;
      bool pinned = false;
      for (size_t gi = 0; gi < p.togetherMasks.size(); gi++)
        if ((pile.mask & p.togetherMasks[gi]) && sh != togShelf[gi]) pinned = true;
      if (pinned) continue;
      int& w = sh == 0 ? s.wA : s.wB;
      if (w + pile.width > p.maxWidth()) continue;
      (sh == 0 ? s.maskA : s.maskB) |= pile.mask;
      w += pile.width;
      s.holes += pile.holes;
      s.topOver += topOverArea(pile, p.heightBase);
      (sh == 0 ? s.pA : s.pB).push_back(pi);
    }
    collectTwo(pool, s, sets, boxes, allMask, p, shelfDepths);
  }
}

static int runFillAll(const std::vector<Box>& boxes, Params& p) {
  std::vector<int> shelfDepths = p.shelfDepths;
  if (shelfDepths.empty()) shelfDepths = {p.depthMax, 470};
  if (shelfDepths.size() != 2) {
    std::cerr << "--fill-all needs exactly two --shelf depths\n";
    return 1;
  }
  static ShelfSet sets[2];
  for (int sh = 0; sh < 2; sh++) {
    sets[sh].prm = p;
    sets[sh].prm.depthMax = shelfDepths[sh];
    sets[sh].orients = buildOrients(boxes, sets[sh].prm, sh == 1 ? p.pinAMask : 0);
    sets[sh].cells = buildCells(boxes, sets[sh].orients, sets[sh].prm);
    sets[sh].piles = buildPiles(sets[sh].cells, sets[sh].prm);
    // Prune for search tractability: keep every pile carrying a required or
    // companion box, plus the cleanest of the rest.
    {
      uint64_t special = p.requiredMask | p.longEdgeMask;
      for (uint64_t g : p.togetherMasks) special |= g;
      for (auto& [dep, prov] : p.companions) special |= dep | prov;
      auto& v = sets[sh].piles;
      std::stable_sort(v.begin(), v.end(), [](const Pile& a, const Pile& b) {
        return (double)a.holes / a.width < (double)b.holes / b.width;
      });
      // Keep the cleanest piles PER WIDTH CLASS (round-robin over 25 mm
      // buckets) — a flat cleanliness cut-off keeps thousands of near-twin
      // wide piles and starves the narrow widths a shelf needs to finish.
      // Then a COVERAGE floor: every box keeps a minimum number of its
      // cleanest piles, so leftover boxes always have somewhere to go.
      std::vector<char> take(v.size(), 0);
      auto quota = [&](bool wantSpecial, size_t cap) {
        std::map<int, std::vector<size_t>> byW;
        for (size_t i = 0; i < v.size(); i++)
          if (bool(v[i].mask & special) == wantSpecial) byW[v[i].width / 25].push_back(i);
        size_t got = 0;
        for (size_t round = 0; got < cap; round++) {
          bool any = false;
          for (auto& [_, bucket] : byW)
            if (round < bucket.size() && got < cap) {
              take[bucket[round]] = 1;
              got++;
              any = true;
            }
          if (!any) break;
        }
      };
      quota(true, 4000);
      quota(false, 5000);
      {
        std::vector<int> perBox(64, 0);
        for (size_t i = 0; i < v.size(); i++)
          if (take[i])
            for (int b = 0; b < 64; b++)
              if (v[i].mask & (1ULL << b)) perBox[b]++;
        for (size_t i = 0; i < v.size(); i++) {
          if (take[i]) continue;
          bool needed = false;
          for (int b = 0; b < 64 && !needed; b++)
            if ((v[i].mask & (1ULL << b)) && perBox[b] < 40) needed = true;
          if (!needed) continue;
          take[i] = 1;
          for (int b = 0; b < 64; b++)
            if (v[i].mask & (1ULL << b)) perBox[b]++;
        }
      }
      std::vector<Pile> kept;
      for (size_t i = 0; i < v.size(); i++)
        if (take[i]) kept.push_back(std::move(v[i]));
      v = std::move(kept);
    }
    std::cerr << "shelf " << (sh ? "B" : "A") << " (depth " << shelfDepths[sh]
              << "): " << sets[sh].orients.size() << " orientations, " << sets[sh].cells.size()
              << " cells, " << sets[sh].piles.size() << " piles\n";
  }
  uint64_t allMask = boxes.size() >= 64 ? ~0ULL : ((1ULL << boxes.size()) - 1);

  std::map<std::pair<uint64_t, uint64_t>, TwoSol> pool;
  std::vector<std::pair<int, int>> order;
  for (int sh = 0; sh < 2; sh++)
    for (size_t i = 0; i < sets[sh].piles.size(); i++) order.push_back({sh, (int)i});
  auto byCleanliness = order;
  std::sort(byCleanliness.begin(), byCleanliness.end(), [&](auto a, auto b) {
    const Pile& x = sets[a.first].piles[a.second];
    const Pile& y = sets[b.first].piles[b.second];
    return (double)x.holes / x.width < (double)y.holes / y.width;
  });
  twoBeam(sets, byCleanliness, p, boxes, allMask, shelfDepths, pool, 1500);
  auto byWidth = order;
  std::sort(byWidth.begin(), byWidth.end(), [&](auto a, auto b) {
    return sets[a.first].piles[a.second].width > sets[b.first].piles[b.second].width;
  });
  twoBeam(sets, byWidth, p, boxes, allMask, shelfDepths, pool, 1500);
  std::mt19937_64 rng(7);
  for (int pass = 0; pass < 8; pass++) {
    auto shuffled = order;
    std::shuffle(shuffled.begin(), shuffled.end(), rng);
    twoBeam(sets, shuffled, p, boxes, allMask, shelfDepths, pool, 800);
  }
  twoGreedy(sets, p, boxes, allMask, shelfDepths, pool, 150000, 987654321);
  twoGreedy(sets, p, boxes, allMask, shelfDepths, pool, 150000, 555000111);
  twoGreedy(sets, p, boxes, allMask, shelfDepths, pool, 150000, 42424242);

  // Pinned passes: restrict cluster-carrying piles to a designated shelf so
  // complete-width states stop dying on the cluster-split check.
  for (int reqShelf = 0; reqShelf < 2; reqShelf++)
    for (int togShelf = 0; togShelf < 2; togShelf++) {
      auto pinFilter = [&](const std::vector<std::pair<int, int>>& src) {
        std::vector<std::pair<int, int>> v;
        for (auto c : src) {
          const Pile& pile = sets[c.first].piles[c.second];
          if ((pile.mask & p.requiredMask) && c.first != reqShelf) continue;
          bool bad = false;
          for (uint64_t g : p.togetherMasks)
            if ((pile.mask & g) && c.first != togShelf) bad = true;
          if (bad) continue;
          v.push_back(c);
        }
        return v;
      };
      twoBeam(sets, pinFilter(byCleanliness), p, boxes, allMask, shelfDepths, pool, 800);
      twoBeam(sets, pinFilter(byWidth), p, boxes, allMask, shelfDepths, pool, 800);
    }

  std::cerr << pool.size() << " complete double-fill packings (" << gOk << " collected, "
            << gIncomplete << " incomplete, " << gCluster << " cluster-split, " << gMissingBoxes
            << " missing-boxes)\n";
  if (pool.empty()) {
    std::cerr << "no packing fills both rectangles under the given constraints\n"
              << "closest widths: shelf A " << gBestA << " mm, shelf B " << gBestB << " mm (need "
              << p.widthBase << " each)\n";
    std::cerr << "  A piles:";
    for (int w : gBestPilesA) std::cerr << " " << w;
    std::cerr << "\n  B piles:";
    for (int w : gBestPilesB) std::cerr << " " << w;
    std::cerr << "\n";
    if (p.useAll && gBestPlaced >= 0) {
      std::cerr << "best width-complete attempt placed " << gBestPlaced << "/" << boxes.size()
                << " boxes; still out:";
      for (size_t i = 0; i < boxes.size(); i++)
        if (!(gBestPlacedMask & (1ULL << i))) std::cerr << " " << boxes[i].name;
      std::cerr << "\n";
    }
    return 1;
  }

  std::vector<TwoSol> ranked;
  for (auto& [_, s] : pool) ranked.push_back(std::move(s));
  std::sort(ranked.begin(), ranked.end(), [](const TwoSol& a, const TwoSol& b) {
    if (a.holes != b.holes) return a.holes < b.holes;
    if (a.spill != b.spill) return a.spill < b.spill;
    return a.depthSum > b.depthSum;
  });

  // Exact pass: arrange the strongest candidates and score the holes that
  // actually remain INSIDE the nominal windows (edge slack that escapes into
  // the overhang no longer counts). Re-rank on that.
  struct Evald {
    const TwoSol* s;
    long long exact;
    Solution shelfSol[2];
    std::vector<PlacedRect> layouts[2];
    int offsets[2];
  };
  std::vector<Evald> evald;
  for (size_t i = 0; i < ranked.size() && evald.size() < 250; i++) {
    const TwoSol& s = ranked[i];
    Evald e;
    e.s = &s;
    e.exact = 0;
    bool ok = true;
    for (int sh = 0; sh < 2 && ok; sh++) {
      Solution& ss = e.shelfSol[sh];
      ss.mask = sh == 0 ? s.maskA : s.maskB;
      ss.width = sh == 0 ? s.wA : s.wB;
      for (int pi : (sh == 0 ? s.pA : s.pB)) {
        const Pile& pile = sets[sh].piles[pi];
        ss.vol += pile.vol;
        ss.depthSum += pile.depthSum;
        ss.piles.push_back(pi);
      }
      Params pk = sets[sh].prm;
      pk.requiredMask = (ss.mask & p.requiredMask) == p.requiredMask ? p.requiredMask : 0;
      pk.togetherMasks.clear();
      for (uint64_t g : p.togetherMasks)
        if ((ss.mask & g) == g) pk.togetherMasks.push_back(g);
      long long holes = 0;
      ok = arrangeSolution(ss, sets[sh].piles, sets[sh].cells, pk, e.layouts[sh], &e.offsets[sh],
                           &holes);
      e.exact += holes;
    }
    if (!ok) {
      extern long long gArrangeFail;
      gArrangeFail++;
      continue;
    }
    evald.push_back(std::move(e));
  }
  std::stable_sort(evald.begin(), evald.end(), [](const Evald& a, const Evald& b) {
    if (a.exact != b.exact) return a.exact < b.exact;
    return a.s->spill < b.s->spill;
  });

  std::string mk = "mkdir -p " + p.out;
  if (system(mk.c_str()) != 0) std::cerr << "warning: could not create " << p.out << "\n";
  std::ofstream rep(p.out + "/solutions.txt");
  int emitted = 0;
  std::vector<std::pair<uint64_t, uint64_t>> kept;
  for (Evald& e : evald) {
    const TwoSol& s = *e.s;
    bool similar = false;
    for (auto& [ka, kb] : kept)
      if (__builtin_popcountll(s.maskA ^ ka) + __builtin_popcountll(s.maskB ^ kb) < 6) {
        similar = true;
        break;
      }
    if (similar) continue;
    Solution* shelfSol = e.shelfSol;
    std::vector<PlacedRect>* layouts = e.layouts;
    kept.push_back({s.maskA, s.maskB});
    emitted++;

    for (std::ostream* os : {(std::ostream*)&std::cout, (std::ostream*)&rep}) {
      *os << "── Solution " << emitted << ": holes in rect " << (double)e.exact / 100.0
          << " cm2 (raw slack " << (double)s.holes / 100.0 << " cm2, escaped "
          << (double)(s.holes - e.exact) / 100.0 << "), reserve spill "
          << (double)s.spill / 100.0 << " cm2, vol "
          << (double)s.vol / 1e6 << " L, widths A=" << s.wA << " B=" << s.wB << " mm, boxes "
          << __builtin_popcountll(s.maskA | s.maskB) << "\n";
      for (int sh = 0; sh < 2; sh++) {
        *os << "  shelf " << (sh ? "B" : "A") << " (depth " << shelfDepths[sh] << "):\n";
        const auto& pv = sh == 0 ? s.pA : s.pB;
        for (size_t k = 0; k < pv.size(); k++) {
          const Pile& pile = sets[sh].piles[pv[k]];
          *os << "    pile " << k + 1 << " w=" << pile.width << " h=" << pile.height
              << " holes=" << pile.holes / 100.0 << "cm2:";
          for (int ci : pile.cells) {
            const Cell& cell = sets[sh].cells[ci];
            *os << " [";
            for (int u = 0; u < unitCountOf(cell); u++) {
              if (u) *os << " | ";
              bool first = true;
              for (const Placement& pl : cell.boxes) {
                if (pl.unit != u) continue;
                if (!first) *os << " + ";
                first = false;
                *os << boxes[pl.box].name << " " << pl.fw << "x" << pl.fh << " d" << pl.d;
              }
            }
            *os << "]";
          }
          *os << "\n";
        }
      }
      *os << "  left out:";
      bool anyOut = false;
      for (size_t i = 0; i < boxes.size(); i++)
        if (!((s.maskA | s.maskB) & (1ULL << i))) {
          *os << " " << boxes[i].name;
          anyOut = true;
        }
      if (!anyOut) *os << " (none)";
      *os << "\n\n";
    }

    for (int sh = 0; sh < 2; sh++) {
      std::vector<std::string> extra;
      char path[256];
      snprintf(path, sizeof path, "%s/solution_%02d_%c.png", p.out.c_str(), emitted,
               sh ? 'B' : 'A');
      char suffix[64];
      snprintf(suffix, sizeof suffix, " SHELF %c  HOLES IN RECT %.0f CM2", sh ? 'B' : 'A',
               (double)e.exact / 100.0);
      renderSolution(shelfSol[sh], layouts[sh], boxes, sets[sh].prm, path, emitted,
                     e.offsets[sh], extra, suffix);
    }
    if (emitted >= p.solutions) break;
  }
  extern long long gArrangeFail;
  if (gArrangeFail)
    std::cerr << gArrangeFail << " complete packings dropped: cluster arrangement failed\n";
  std::cerr << "wrote " << emitted << " fill-all solutions to " << p.out << "/\n";
  return 0;
}

long long gArrangeFail = 0;

int main(int argc, char** argv) {
  Params p;
  std::string input;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    auto next = [&](int& target) { target = std::stoi(argv[++i]); };
    if (a == "--width") next(p.widthBase);
    else if (a == "--height") next(p.heightBase);
    else if (a == "--over-left") next(p.overLeft);
    else if (a == "--over-right") next(p.overRight);
    else if (a == "--over-top") next(p.overTop);
    else if (a == "--depth-max") next(p.depthMax);
    else if (a == "--tol") next(p.tolPerBox);
    else if (a == "--spill-cost") next(p.spillCost);
    else if (a == "--require") p.require.push_back(argv[++i]);
    else if (a == "--together") p.together.push_back(argv[++i]);
    else if (a == "--flat") p.flatOnly = true;
    else if (a == "--shelf") {
      int d = 0;
      next(d);
      p.shelfDepths.push_back(d);
    } else if (a == "--fill-all") p.fillAll = true;
    else if (a == "--width-slack") next(p.widthSlack);
    else if (a == "--height-slack") next(p.heightSlack);
    else if (a == "--vert-inside") p.vertInside = true;
    else if (a == "--use-all") p.useAll = true;
    else if (a == "--exclude") p.exclude.push_back(argv[++i]);
    else if (a == "--long-edge") p.longEdge.push_back(argv[++i]);
    else if (a == "--requires") {
      std::string v = argv[++i];
      size_t comma = v.find(',');
      p.requiresRaw.push_back({v.substr(0, comma), v.substr(comma + 1)});
    }
    else if (a == "--pin-a") p.pinA.push_back(argv[++i]);
    else if (a == "--solutions") next(p.solutions);
    else if (a == "--out") p.out = argv[++i];
    else input = a;
  }
  if (input.empty()) {
    std::cerr << "usage: shelf-packer boxes.csv [--out DIR] [--width MM] [--height MM]\n"
              << "       [--over-left MM] [--over-right MM] [--over-top MM]\n"
              << "       [--depth-max MM] [--tol MM] [--solutions N]\n";
    return 1;
  }

  std::vector<Box> boxes = loadBoxes(input);
  auto nameMatch = [&](const std::string& pat, const std::string& name) {
    bool prefix = !pat.empty() && pat.back() == '*';
    return prefix ? name.rfind(pat.substr(0, pat.size() - 1), 0) == 0 : name == pat;
  };
  for (const std::string& ex : p.exclude) {
    size_t before = boxes.size();
    boxes.erase(std::remove_if(boxes.begin(), boxes.end(),
                               [&](const Box& b) { return nameMatch(ex, b.name); }),
                boxes.end());
    if (boxes.size() == before) std::cerr << "warning: --exclude matched nothing: " << ex << "\n";
  }
  for (const std::string& le : p.longEdge) {
    bool hit = false;
    for (size_t i = 0; i < boxes.size(); i++)
      if (nameMatch(le, boxes[i].name)) {
        p.longEdgeMask |= 1ULL << i;
        hit = true;
      }
    if (!hit) std::cerr << "warning: --long-edge matched nothing: " << le << "\n";
  }
  for (auto& [dep, prov] : p.requiresRaw) {
    uint64_t dm = 0, pm = 0;
    for (size_t i = 0; i < boxes.size(); i++) {
      if (boxes[i].name == dep) dm = 1ULL << i;
      if (boxes[i].name == prov) pm = 1ULL << i;
    }
    if (!dm || !pm) std::cerr << "warning: --requires member missing: " << dep << "," << prov
                              << "\n";
    else p.companions.push_back({dm, pm});
  }
  for (const std::string& req : p.require) {
    bool prefix = !req.empty() && req.back() == '*';
    std::string stem = prefix ? req.substr(0, req.size() - 1) : req;
    bool hit = false;
    for (size_t i = 0; i < boxes.size(); i++) {
      if (prefix ? boxes[i].name.rfind(stem, 0) == 0 : boxes[i].name == stem) {
        p.requiredMask |= 1ULL << i;
        hit = true;
      }
    }
    if (!hit) std::cerr << "warning: --require matched nothing: " << req << "\n";
  }
  for (const std::string& req : p.pinA) {
    bool prefix = !req.empty() && req.back() == '*';
    std::string stem = prefix ? req.substr(0, req.size() - 1) : req;
    bool hit = false;
    for (size_t i = 0; i < boxes.size(); i++) {
      if (prefix ? boxes[i].name.rfind(stem, 0) == 0 : boxes[i].name == stem) {
        p.pinAMask |= 1ULL << i;
        hit = true;
      }
    }
    if (!hit) std::cerr << "warning: --pin-a matched nothing: " << req << "\n";
  }
  for (const std::string& group : p.together) {
    uint64_t mask = 0;
    std::stringstream gss(group);
    std::string name;
    while (std::getline(gss, name, ',')) {
      bool hit = false;
      for (size_t i = 0; i < boxes.size(); i++)
        if (boxes[i].name == name) {
          mask |= 1ULL << i;
          hit = true;
        }
      if (!hit) std::cerr << "warning: --together member matched nothing: " << name << "\n";
    }
    if (__builtin_popcountll(mask) >= 2) p.togetherMasks.push_back(mask);
  }
  if (p.fillAll) return runFillAll(boxes, p);
  std::vector<Orient> orients = buildOrients(boxes, p);
  std::vector<Cell> cells = buildCells(boxes, orients, p);
  std::vector<Pile> piles = buildPiles(cells, p);
  std::cerr << boxes.size() << " boxes, " << orients.size() << " orientations, " << cells.size()
            << " cells, " << piles.size() << " candidate piles\n";
  if (piles.empty()) {
    std::cerr << "no valid piles — nothing reaches the required height\n";
    return 1;
  }

  std::map<uint64_t, Solution> pool;
  // Beam passes with different pile orderings.
  std::vector<int> order(piles.size());
  for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
  auto byDensity = order;
  std::sort(byDensity.begin(), byDensity.end(), [&](int a, int b) {
    return (double)piles[a].vol / piles[a].width > (double)piles[b].vol / piles[b].width;
  });
  auto byVolume = order;
  std::sort(byVolume.begin(), byVolume.end(),
            [&](int a, int b) { return piles[a].vol > piles[b].vol; });
  beamSearch(piles, byDensity, p, pool, 1500);
  beamSearch(piles, byVolume, p, pool, 1500);
  std::mt19937_64 rng(42);
  for (int pass = 0; pass < 2; pass++) {
    auto shuffled = order;
    std::shuffle(shuffled.begin(), shuffled.end(), rng);
    beamSearch(piles, shuffled, p, pool, 800);
  }
  greedyRestarts(piles, p, pool, 20000, 1234567);

  std::vector<Solution> ranked;
  ranked.reserve(pool.size());
  for (auto& [_, s] : pool) ranked.push_back(std::move(s));
  std::sort(ranked.begin(), ranked.end(), [&](const Solution& a, const Solution& b) {
    long long sa = solutionScore(a.vol, a.overArea, 0, p);
    long long sb = solutionScore(b.vol, b.overArea, 0, p);
    if (sa != sb) return sa > sb;
    return betterSolution(a, b);
  });
  // Diversify: skip solutions that differ from an already-picked one by
  // fewer than 6 boxes (pandemic-1 ↔ pandemic-2 swaps are not "another
  // solution" to a human).
  std::vector<Solution> sols;
  std::vector<std::vector<PlacedRect>> layouts;
  std::vector<int> offsets;
  int rejectedRequired = 0, rejectedCluster = 0;
  for (const Solution& s : ranked) {
    if ((s.mask & p.requiredMask) != p.requiredMask) {
      rejectedRequired++;
      continue;
    }
    bool similar = false;
    for (const Solution& kept : sols) {
      if (__builtin_popcountll(s.mask ^ kept.mask) < 6) {
        similar = true;
        break;
      }
    }
    if (similar) continue;
    std::vector<PlacedRect> layout;
    int off = 0;
    if (!arrangeSolution(s, piles, cells, p, layout, &off)) {
      rejectedCluster++;
      continue;
    }
    sols.push_back(s);
    layouts.push_back(std::move(layout));
    offsets.push_back(off);
    if ((int)sols.size() >= p.solutions) break;
  }
  if (p.requiredMask) {
    std::cerr << "required-box filter: " << rejectedRequired
              << " solutions missing boxes, " << rejectedCluster
              << " not arrangeable as a touching cluster\n";
  }

  std::string mk = "mkdir -p " + p.out;
  if (system(mk.c_str()) != 0) std::cerr << "warning: could not create " << p.out << "\n";
  std::ofstream rep(p.out + "/solutions.txt");
  for (size_t i = 0; i < sols.size(); i++) {
    report(std::cout, sols[i], piles, cells, boxes, (int)i + 1);
    report(rep, sols[i], piles, cells, boxes, (int)i + 1);
    char path[256];
    snprintf(path, sizeof path, "%s/solution_%02d.png", p.out.c_str(), (int)i + 1);
    renderSolution(sols[i], layouts[i], boxes, p, path, (int)i + 1, offsets[i]);
  }
  std::cerr << "wrote " << sols.size() << " solutions to " << p.out << "/\n";
  return 0;
}
