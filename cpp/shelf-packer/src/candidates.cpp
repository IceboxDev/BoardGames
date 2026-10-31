#include "sp/candidates.hpp"

#include <algorithm>
#include <set>
#include <stdexcept>
#include <tuple>
#include <unordered_map>

#include "sp/tuning.hpp"

namespace sp {

const char* describe(PileFault f) {
  switch (f) {
    case PileFault::None:
      return "ok";
    case PileFault::Support:
      return "a box is wider than the box it rests on";
    case PileFault::CellHeights:
      return "side-by-side units differ in height";
    case PileFault::PileWidth:
      return "a cell is narrower than the pile allows, or the pile is wider than the shelf";
    case PileFault::PileHeight:
      return "the pile misses the nominal height or passes the top reserve";
    case PileFault::StandingTop:
      return "a standing box pokes above the nominal height (--vert-inside)";
    case PileFault::Group:
      return "it can never satisfy a group rule";
    case PileFault::Count:
      break;
  }
  return "?";
}

namespace {

long long mismatch(const Cell& c) { return (long long)c.width * c.height - c.faceArea; }
// Mismatch per mm of width, ascending (cross-multiplied, exact).
bool cleanerCell(const Cell& a, const Cell& b) {
  return mismatch(a) * b.width < mismatch(b) * a.width;
}
bool cleanerPile(const Pile& a, const Pile& b) { return a.holes * b.width < b.holes * a.width; }

struct MemberAt {
  int cell;
  Placement pl;
};

std::vector<MemberAt> membersIn(const std::vector<Cell>& cells, const Pile& pile, BoxSet group) {
  std::vector<MemberAt> out;
  for (int ci : pile.cells)
    for (const Placement& pl : cells[ci].boxes)
      if (group.has(pl.o.box)) out.push_back({ci, pl});
  return out;
}

bool sideBySide(const MemberAt& a, const MemberAt& b) {
  return a.cell == b.cell && a.pl.unit != b.pl.unit;
}
bool flatFace(const Placement& pl) { return pl.o.fw >= pl.o.fh; }      // long edges horizontal
bool standingFace(const Placement& pl) { return pl.o.fh >= pl.o.fw; }  // long edges vertical

// Could the members found in this pile still end up satisfying the group's
// contact rule once the group is complete? Only necessary conditions: a
// pile is never rejected when some packing could make it legal.
bool canComplete(const Group& g, BoxSet in, const std::vector<MemberAt>& m, BoxSet longEdge) {
  switch (g.contact) {
    case Contact::StrictRun: {
      // A row: standing members side by side — in this pile, one cell,
      // one unit each (a partial row continues in a neighbouring pile).
      bool row = true;
      for (size_t i = 0; i < m.size(); i++) {
        if (!standingFace(m[i].pl) || m[i].cell != m[0].cell) row = false;
        for (size_t j = 0; j < i; j++)
          if (m[j].pl.unit == m[i].pl.unit) row = false;
      }
      // A tower: the whole group in this pile, equal face widths, never two
      // members side by side.
      bool tower = in == g.members;
      for (size_t i = 0; i < m.size() && tower; i++) {
        if (m[i].pl.o.fw != m[0].pl.o.fw) tower = false;
        for (size_t j = 0; j < i; j++)
          if (sideBySide(m[i], m[j])) tower = false;
      }
      return row || tower;
    }
    case Contact::LongEdgeBoth: {
      if (g.members.count() != 2) return true;
      if (m.size() == 1) return standingFace(m[0].pl);  // partner sits across a pile seam
      const MemberAt& a = m[0];
      const MemberAt& b = m[1];
      bool above = flatFace(a.pl) && flatFace(b.pl) && !sideBySide(a, b);
      bool beside = standingFace(a.pl) && standingFace(b.pl) && sideBySide(a, b);
      return above || beside;
    }
    case Contact::Touch: {
      // A --long-edge member lying flat (and not square) only meets the
      // group above or below it, i.e. inside this pile.
      if (g.members.count() < 2 || in.count() >= 2) return true;
      for (const MemberAt& x : m)
        if (longEdge.has(x.pl.o.box) && x.pl.o.fw > x.pl.o.fh) return false;
      return true;
    }
  }
  return true;
}

bool groupsAllow(const Problem& p, const std::vector<Cell>& cells, const Pile& pile) {
  for (const Group& g : p.groups) {
    BoxSet in = pile.mask & g.members;
    if (in.empty()) continue;
    bool mayStayIncomplete = g.presence == Presence::Requires && !in.intersects(g.dependents);
    if (mayStayIncomplete) continue;
    if (!canComplete(g, in, membersIn(cells, pile, g.members), p.longEdge)) return false;
  }
  return true;
}

BoxSet groupBoxes(const Problem& p) {
  BoxSet s;
  for (const Group& g : p.groups) s |= g.members;
  return s;
}

// ── Units ──────────────────────────────────────────────────────────────

// One box, or a column of two (the upper no wider than its support).
std::vector<Cell> buildUnits(const Problem& p, const std::vector<Orient>& os) {
  std::vector<Cell> units;
  for (const Orient& o : os) {
    UnitStack s{o};
    units.push_back(makeCell({&s, 1}, p.boxes));
  }
  const int columnMax = p.geo.heightBase * tuning::kColumnMaxHeightPct / 100;
  std::vector<Cell> columns;
  for (const Orient& below : os)
    for (const Orient& above : os) {
      if (below.box == above.box) continue;
      if (above.fw > below.fw + p.geo.matchTol()) continue;
      int h = below.fh + above.fh;
      if (h > columnMax) continue;
      if (p.vertInside && above.vert && h > p.geo.heightBase) continue;
      UnitStack s{below, above};
      columns.push_back(makeCell({&s, 1}, p.boxes));
    }
  std::stable_sort(columns.begin(), columns.end(), cleanerCell);
  if ((int)columns.size() > tuning::kColumnCap) columns.resize(tuning::kColumnCap);
  for (Cell& c : columns) units.push_back(std::move(c));
  return units;
}

// Keeps every column-free cell (the pre-column space stays a subset), then
// column cells round-robin over width × height buckets, then a per-box
// coverage floor.
void capCells(std::vector<Cell>& cells) {
  if ((int)cells.size() <= tuning::kCellCap) return;
  std::vector<char> take(cells.size(), 0);
  int got = 0;
  std::map<std::pair<int, int>, std::vector<size_t>> buckets;
  for (size_t i = 0; i < cells.size(); i++) {
    if (!hasColumn(cells[i])) {
      take[i] = 1;
      got++;
    } else {
      buckets[{cells[i].width / tuning::kBucketMm, cells[i].height / tuning::kBucketMm}].push_back(i);
    }
  }
  for (size_t round = 0; got < tuning::kCellCap; round++) {
    bool any = false;
    for (auto& [_, bucket] : buckets)
      if (round < bucket.size() && got < tuning::kCellCap) {
        take[bucket[round]] = 1;
        got++;
        any = true;
      }
    if (!any) break;
  }
  std::array<int, kMaxBoxes> perBox{};
  for (size_t i = 0; i < cells.size(); i++)
    if (take[i]) cells[i].mask.forEach([&](int b) { perBox[b]++; });
  for (size_t i = 0; i < cells.size(); i++) {
    if (take[i]) continue;
    bool needed = false;
    cells[i].mask.forEach([&](int b) { needed |= perBox[b] < tuning::kCellCoverageFloor; });
    if (!needed) continue;
    take[i] = 1;
    cells[i].mask.forEach([&](int b) { perBox[b]++; });
  }
  std::vector<Cell> kept;
  for (size_t i = 0; i < cells.size(); i++)
    if (take[i]) kept.push_back(std::move(cells[i]));
  cells = std::move(kept);
}

// ── Piles ──────────────────────────────────────────────────────────────

bool betterPile(const Pile& a, const Pile& b) {
  if (a.holes != b.holes) return a.holes < b.holes;
  if (a.vol != b.vol) return a.vol > b.vol;
  return a.depthSum > b.depthSum;
}

// Depth-first over cells inside a width window below each anchor cell,
// deduplicated by box set (the cleanest composition wins).
class PileEnumerator {
 public:
  PileEnumerator(const Problem& p, const std::vector<Cell>& cells, CandidateStats& stats)
      : p_(p), cells_(cells), stats_(stats), groupBoxes_(groupBoxes(p)) {}

  std::vector<Pile> run() {
    std::vector<int> all(cells_.size());
    for (size_t i = 0; i < all.size(); i++) all[i] = (int)i;
    std::stable_sort(all.begin(), all.end(),
                     [&](int a, int b) { return cells_[a].width > cells_[b].width; });
    // Pass 1: column-free cells, exhaustively — every pre-column pile exists.
    std::vector<int> plain;
    for (int ci : all)
      if (!hasColumn(cells_[ci])) plain.push_back(ci);
    enumerate(plain, tuning::kPlainAnchorNodes, tuning::kPlainAnchorRecords);
    // Pass 2: everything, under a per-anchor budget.
    enumerate(all, tuning::kColumnAnchorNodes, tuning::kColumnAnchorRecords);

    std::vector<Pile> piles;
    piles.reserve(best_.size());
    for (auto& [_, pile] : best_) piles.push_back(std::move(pile));
    std::sort(piles.begin(), piles.end(), [](const Pile& a, const Pile& b) {
      return std::tie(a.mask, a.cells) < std::tie(b.mask, b.cells);
    });
    return piles;
  }

 private:
  struct Frame {
    BoxSet mask;
    int height = 0;
    int layers = 0;
  };

  void enumerate(std::vector<int> order, long long perAnchorNodes, int recordCap) {
    order_ = std::move(order);
    // Anchors round-robin over width buckets, so narrow piles (which
    // complete shelf widths) are reached before the budget runs out.
    std::map<int, std::vector<size_t>> buckets;
    for (size_t a = 0; a < order_.size(); a++)
      buckets[cells_[order_[a]].width / tuning::kBucketMm].push_back(a);
    for (size_t round = 0;; round++) {
      bool any = false;
      for (auto& [_, bucket] : buckets) {
        if (round >= bucket.size()) continue;
        any = true;
        size_t a = bucket[round];
        const Cell& c = cells_[order_[a]];
        chosen_.assign(1, order_[a]);
        anchorWidth_ = c.width;
        anchorNodes_ = perAnchorNodes;
        anchorRecorded_ = 0;
        anchorRecordCap_ = recordCap;
        dfs(a + 1, {c.mask, c.height, 1});
      }
      if (!any) break;
    }
  }

  void dfs(size_t idx, const Frame& f) {
    if ((long long)best_.size() > tuning::kPileCap || --nodes_ < 0 || --anchorNodes_ < 0) return;
    if (anchorRecorded_ > anchorRecordCap_) return;
    const Geometry& g = p_.geo;
    // Tolerance accrues once per stacked layer, so a many-box pile cannot
    // bank per-box slack into extra reach.
    if (f.height + f.layers * g.tolPerBox >= g.heightBase - g.heightSlack) record();
    if ((int)chosen_.size() >= tuning::kMaxCellsPerPile) return;
    for (size_t k = idx; k < order_.size(); k++) {
      const Cell& c = cells_[order_[k]];
      if (c.width < anchorWidth_ - g.pileWidthTol()) break;  // widest first: window ended
      if (c.mask.intersects(f.mask)) continue;
      int layers = f.layers + 1;
      int height = f.height + c.height;
      if (height - layers * g.tolPerBox > g.maxHeight()) continue;
      chosen_.push_back(order_[k]);
      dfs(k + 1, {f.mask | c.mask, height, layers});
      chosen_.pop_back();
    }
  }

  void record() {
    std::vector<int> standing;
    if (p_.vertInside && !standingOrder(cells_, chosen_, p_.geo.heightBase, standing)) return;
    Pile pile = composePile(cells_, chosen_, p_.geo.heightBase);
    if (pile.mask.intersects(groupBoxes_) && !groupsAllow(p_, cells_, pile)) {
      stats_.rejected[(size_t)PileFault::Group]++;
      return;
    }
    auto it = best_.find(pile.mask);
    if (it == best_.end()) {
      best_.emplace(pile.mask, std::move(pile));
      anchorRecorded_++;
    } else if (betterPile(pile, it->second)) {
      it->second = std::move(pile);
    }
  }

  const Problem& p_;
  const std::vector<Cell>& cells_;
  CandidateStats& stats_;
  BoxSet groupBoxes_;
  std::vector<int> order_;
  std::vector<int> chosen_;
  std::unordered_map<BoxSet, Pile> best_;
  long long nodes_ = tuning::kPileNodeBudget;
  long long anchorNodes_ = 0;
  int anchorWidth_ = 0, anchorRecorded_ = 0, anchorRecordCap_ = 0;
};

// FillAll keeps the cleanest piles per category — group-carrying piles,
// column-free piles (the pre-column space keeps its seats), column piles —
// round-robin over width buckets, then a per-box coverage floor.
void pruneForFillAll(const Problem& p, ShelfCandidates& s, CandidateStats& stats) {
  BoxSet special = groupBoxes(p) | p.longEdge;
  auto& v = s.piles;
  std::stable_sort(v.begin(), v.end(), cleanerPile);
  auto pileHasColumn = [&](const Pile& pile) {
    for (int ci : pile.cells)
      if (hasColumn(s.cells[ci])) return true;
    return false;
  };
  std::vector<int> category(v.size());
  for (size_t i = 0; i < v.size(); i++)
    category[i] = v[i].mask.intersects(special) ? 0 : pileHasColumn(v[i]) ? 2 : 1;
  std::vector<char> take(v.size(), 0);
  auto quota = [&](int cat, int cap) {
    std::map<int, std::vector<size_t>> buckets;
    for (size_t i = 0; i < v.size(); i++)
      if (category[i] == cat) buckets[v[i].width / tuning::kBucketMm].push_back(i);
    int got = 0;
    for (size_t round = 0; got < cap; round++) {
      bool any = false;
      for (auto& [_, bucket] : buckets)
        if (round < bucket.size() && got < cap) {
          take[bucket[round]] = 1;
          got++;
          any = true;
        }
      if (!any) break;
    }
  };
  quota(0, tuning::kGroupPileQuota);
  quota(1, tuning::kPlainPileQuota);
  quota(2, tuning::kColumnPileQuota);
  std::array<int, kMaxBoxes> perBox{};
  for (size_t i = 0; i < v.size(); i++)
    if (take[i]) v[i].mask.forEach([&](int b) { perBox[b]++; });
  for (size_t i = 0; i < v.size(); i++) {
    if (take[i]) continue;
    bool needed = false;
    v[i].mask.forEach([&](int b) { needed |= perBox[b] < tuning::kPileCoverageFloor; });
    if (!needed) continue;
    take[i] = 1;
    v[i].mask.forEach([&](int b) { perBox[b]++; });
  }
  std::vector<Pile> kept;
  for (size_t i = 0; i < v.size(); i++)
    if (take[i]) kept.push_back(std::move(v[i]));
  stats.pruned += (long long)(v.size() - kept.size());
  v = std::move(kept);
}

// Enumeration caps can starve the exact pile a stack group needs, so build
// the canonical towers directly: every member at one face width, alone and
// with each near-width single box as a cap.
void injectTowers(const Problem& p, ShelfCandidates& s, CandidateStats& stats) {
  std::set<std::vector<int>> present;
  for (const Pile& pile : s.piles) {
    std::vector<int> key = pile.cells;
    std::sort(key.begin(), key.end());
    present.insert(std::move(key));
  }
  for (const Group& g : p.groups) {
    if (g.contact != Contact::StrictRun) continue;
    std::map<int, std::map<int, int>> byWidth;  // face width → box → single-box cell
    for (int ci = 0; ci < (int)s.cells.size(); ci++) {
      const Cell& c = s.cells[ci];
      if (c.boxes.size() == 1 && g.members.has(c.boxes[0].o.box))
        byWidth[c.boxes[0].o.fw][c.boxes[0].o.box] = ci;
    }
    for (const auto& [fw, memberCells] : byWidth) {
      if ((int)memberCells.size() != g.members.count()) continue;
      auto tryPile = [&](int capCell) {
        std::vector<int> cells;
        for (const auto& [_, ci] : memberCells) cells.push_back(ci);
        if (capCell >= 0) cells.push_back(capCell);
        std::vector<int> key = cells;
        std::sort(key.begin(), key.end());
        if (present.count(key)) return;
        Pile pile = composePile(s.cells, std::move(cells), p.geo.heightBase);
        if (checkPile(p, s.cells, pile) != PileFault::None) return;
        present.insert(std::move(key));
        s.piles.push_back(std::move(pile));
        stats.towers++;
      };
      tryPile(-1);
      for (int ci = 0; ci < (int)s.cells.size(); ci++) {
        const Cell& c = s.cells[ci];
        if (c.boxes.size() != 1 || c.mask.intersects(g.members)) continue;
        if (std::abs(c.width - fw) > p.geo.pileWidthTol()) continue;
        tryPile(ci);
      }
    }
  }
}

}  // namespace

std::vector<Orient> buildOrients(const Problem& p, int shelf) {
  const Geometry& g = p.geo;
  const int depthMax = p.shelfDepths[shelf];
  std::vector<Orient> out;
  for (int i = 0; i < (int)p.boxes.size(); i++) {
    if (shelf != 0 && p.pinnedFirst.has(i)) continue;
    const Box& b = p.boxes[i];
    // (face width, face height, depth): w×h deep l, l×h deep w — each also
    // turned 90° so the box stands on its edge, spine out.
    const int faces[4][3] = {{b.w, b.h, b.l}, {b.h, b.w, b.l}, {b.l, b.h, b.w}, {b.h, b.l, b.w}};
    std::set<std::tuple<int, int, int>> seen;
    for (int k = 0; k < 4; k++) {
      Orient o{i, faces[k][0], faces[k][1], faces[k][2], k == 1 || k == 3};
      if (p.flatOnly && o.vert) continue;
      if (p.vertInside && o.vert && o.fh > g.heightBase) continue;
      if (o.d > depthMax || o.fh > g.maxHeight() + g.tolPerBox || o.fw > g.maxWidth()) continue;
      if (seen.insert({o.fw, o.fh, o.d}).second) out.push_back(o);
    }
  }
  return out;
}

std::vector<Cell> buildCells(const Problem& p, const std::vector<Orient>& os) {
  const Geometry& g = p.geo;
  std::vector<Cell> units = buildUnits(p, os);
  std::vector<Cell> cells = units;

  // Two units side by side, heights matching.
  std::vector<int> byHeight(units.size());
  for (size_t i = 0; i < byHeight.size(); i++) byHeight[i] = (int)i;
  std::stable_sort(byHeight.begin(), byHeight.end(),
                   [&](int a, int b) { return units[a].height < units[b].height; });
  size_t pairStart = cells.size();
  for (size_t i = 0; i < byHeight.size(); i++) {
    const Cell& a = units[byHeight[i]];
    for (size_t j = i + 1; j < byHeight.size(); j++) {
      const Cell& b = units[byHeight[j]];
      if (b.height - a.height > g.matchTol()) break;
      if (a.mask.intersects(b.mask) || a.width + b.width > g.maxWidth()) continue;
      UnitStack pair[2] = {unitsOf(a)[0], unitsOf(b)[0]};
      cells.push_back(makeCell(pair, p.boxes));
    }
  }
  size_t pairEnd = cells.size();

  // Three single boxes side by side (wide-pile partners), deepest per
  // (box set, width).
  std::map<std::pair<BoxSet, int>, size_t> tripleAt;
  for (size_t ci = pairStart; ci < pairEnd; ci++) {
    if (cells[ci].boxes.size() != 2) continue;  // two single-box units only
    for (const Orient& o : os) {
      const Cell& pc = cells[ci];
      if (pc.mask.has(o.box)) continue;
      int lo = std::min({pc.boxes[0].o.fh, pc.boxes[1].o.fh, o.fh});
      int hi = std::max({pc.boxes[0].o.fh, pc.boxes[1].o.fh, o.fh});
      if (hi - lo > g.matchTol()) continue;
      int width = pc.width + o.fw;
      if (width > g.maxWidth() || width < tuning::kTripleMinWidth) continue;
      UnitStack trio[3] = {{pc.boxes[0].o}, {pc.boxes[1].o}, {o}};
      Cell c = makeCell(trio, p.boxes);
      auto key = std::make_pair(c.mask, c.width);
      auto it = tripleAt.find(key);
      if (it == tripleAt.end()) {
        tripleAt.emplace(key, cells.size());
        cells.push_back(std::move(c));
      } else if (c.depthSum > cells[it->second].depthSum) {
        cells[it->second] = std::move(c);
      }
    }
  }

  // One cell per (box set, width, height): the lowest mismatch density.
  std::stable_sort(cells.begin(), cells.end(), cleanerCell);
  std::set<std::tuple<BoxSet, int, int>> seen;
  {
    std::vector<Cell> unique;
    for (Cell& c : cells)
      if (seen.insert({c.mask, c.width, c.height}).second) unique.push_back(std::move(c));
    cells = std::move(unique);
  }
  capCells(cells);

  // A --long-edge box standing beside any height-matched cell, so "the box
  // on the side of a flush column" is always in the pool.
  size_t base = cells.size();
  for (const Orient& o : os) {
    if (!o.vert || !p.longEdge.has(o.box)) continue;
    for (size_t ci = 0; ci < base; ci++) {
      const Cell& pc = cells[ci];
      if (pc.mask.has(o.box) || std::abs(pc.height - o.fh) > g.matchTol()) continue;
      if (o.fw + pc.width > g.maxWidth()) continue;
      std::vector<UnitStack> stacks{{o}};
      for (UnitStack& u : unitsOf(pc)) stacks.push_back(std::move(u));
      Cell c = makeCell(stacks, p.boxes);
      bool matched = true;
      for (int u = 0; u < c.units; u++) matched &= unitHeight(c, u) >= c.height - g.matchTol();
      if (!matched || !seen.insert({c.mask, c.width, c.height}).second) continue;
      cells.push_back(std::move(c));
    }
  }
  return cells;
}

PileFault checkPile(const Problem& p, const std::vector<Cell>& cells, const Pile& pile) {
  const Geometry& g = p.geo;
  if (pile.width > g.maxWidth()) return PileFault::PileWidth;
  for (int ci : pile.cells) {
    const Cell& c = cells[ci];
    for (size_t k = 1; k < c.boxes.size(); k++) {
      const Placement& below = c.boxes[k - 1];
      const Placement& above = c.boxes[k];
      if (above.unit == below.unit && above.o.fw > below.o.fw + g.matchTol())
        return PileFault::Support;
    }
    for (int u = 0; u < c.units; u++)
      if (unitHeight(c, u) < c.height - g.matchTol()) return PileFault::CellHeights;
    if (c.width < pile.width - g.pileWidthTol()) return PileFault::PileWidth;
  }
  int reach = pile.layers() * g.tolPerBox;
  if (pile.height + reach < g.heightBase - g.heightSlack || pile.height - reach > g.maxHeight())
    return PileFault::PileHeight;
  std::vector<int> standing;
  if (p.vertInside && !standingOrder(cells, pile.cells, g.heightBase, standing))
    return PileFault::StandingTop;
  if (!groupsAllow(p, cells, pile)) return PileFault::Group;
  return PileFault::None;
}

ShelfCandidates buildShelf(const Problem& p, int shelf, CandidateStats& stats) {
  ShelfCandidates s;
  s.shelf = shelf;
  s.depth = p.shelfDepths[shelf];
  s.orients = buildOrients(p, shelf);
  s.cells = buildCells(p, s.orients);
  s.piles = PileEnumerator(p, s.cells, stats).run();
  stats.enumerated += (long long)s.piles.size();
  // Enumeration builds legal piles by construction; prove it stays so.
  for (const Pile& pile : s.piles)
    if (PileFault f = checkPile(p, s.cells, pile); f != PileFault::None)
      throw std::logic_error(std::string("enumerated an illegal pile: ") + describe(f));
  if (p.objective == Objective::FillAll) pruneForFillAll(p, s, stats);
  injectTowers(p, s, stats);
  return s;
}

// ── External piles ─────────────────────────────────────────────────────

ExternalPiles::ExternalPiles(const Problem& p, ShelfCandidates& shelf) : p_(p), shelf_(shelf) {
  for (int i = 0; i < (int)shelf_.piles.size(); i++)
    byKey_.emplace(canonicalKey(shelf_.piles[i]), i);
}

std::string ExternalPiles::canonicalKey(const Pile& pile) const {
  std::vector<std::string> parts;
  for (int ci : pile.cells) parts.push_back(formatCell(shelf_.cells[ci], p_.boxes));
  std::sort(parts.begin(), parts.end());
  std::string key;
  for (const std::string& s : parts) key += s;
  return key;
}

int ExternalPiles::admit(const PileSpec& spec, std::string& why) {
  BoxSet used;
  std::vector<Cell> newCells;
  for (const CellSpec& cs : spec) {
    std::vector<UnitStack> units;
    for (const UnitSpec& us : cs) {
      UnitStack stack;
      for (const BoxSpec& b : us) {
        int box = boxIndex(p_.boxes, b.name);
        if (box < 0) {
          why = "unknown box '" + b.name + "'";
          return -1;
        }
        if (used.has(box)) {
          why = "box '" + b.name + "' appears twice";
          return -1;
        }
        used.add(box);
        auto it = std::find_if(shelf_.orients.begin(), shelf_.orients.end(), [&](const Orient& o) {
          return o.box == box && o.fw == b.fw && o.fh == b.fh && o.d == b.d;
        });
        if (it == shelf_.orients.end()) {
          why = b.name + " " + std::to_string(b.fw) + "x" + std::to_string(b.fh) + " d" +
                std::to_string(b.d) + " is not a legal orientation of that box on shelf " +
                shelfLetter(shelf_.shelf);
          return -1;
        }
        stack.push_back(*it);
      }
      units.push_back(std::move(stack));
    }
    newCells.push_back(makeCell(units, p_.boxes));
  }
  size_t before = shelf_.cells.size();
  std::vector<int> idx;
  for (Cell& c : newCells) {
    idx.push_back((int)shelf_.cells.size());
    shelf_.cells.push_back(std::move(c));
  }
  Pile pile = composePile(shelf_.cells, std::move(idx), p_.geo.heightBase);
  PileFault f = checkPile(p_, shelf_.cells, pile);
  std::string key = f == PileFault::None ? canonicalKey(pile) : std::string();
  auto existing = byKey_.find(key);
  if (f != PileFault::None || existing != byKey_.end()) {
    shelf_.cells.resize(before);
    if (f != PileFault::None) {
      why = describe(f);
      return -1;
    }
    return existing->second;
  }
  shelf_.piles.push_back(std::move(pile));
  int index = (int)shelf_.piles.size() - 1;
  byKey_.emplace(std::move(key), index);
  return index;
}

}  // namespace sp
