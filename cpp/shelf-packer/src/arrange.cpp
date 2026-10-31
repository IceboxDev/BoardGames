#include "sp/arrange.hpp"

#include <algorithm>
#include <map>
#include <numeric>
#include <unordered_map>

#include "sp/tuning.hpp"

namespace sp {

void settle(std::vector<Rect>& layout) {
  std::vector<int> idx(layout.size());
  std::iota(idx.begin(), idx.end(), 0);
  std::stable_sort(idx.begin(), idx.end(),
                   [&](int a, int b) { return layout[a].y0 < layout[b].y0; });
  for (size_t k = 0; k < idx.size(); k++) {
    Rect& r = layout[idx[k]];
    int rest = 0;
    for (size_t j = 0; j < k; j++) {
      const Rect& o = layout[idx[j]];
      if (std::min(r.x1(), o.x1()) - std::max(r.x0, o.x0) > 0) rest = std::max(rest, o.y1());
    }
    r.y0 = rest;
  }
}

long long interiorHoles(const std::vector<Rect>& layout, int width, const Geometry& g,
                        int& window) {
  int lo = std::max(0, width - g.widthBase - g.overRight);
  int hi = std::min(g.overLeft, std::max(0, width - g.widthBase));
  long long best = -1;
  window = 0;
  for (int a = lo; a <= hi; a++) {
    long long covered = 0;
    for (const Rect& r : layout) {
      int x0 = std::max(r.x0, a), x1 = std::min(r.x1(), a + g.widthBase);
      int y1 = std::min(r.y1(), g.heightBase);
      if (x1 > x0 && y1 > r.y0) covered += (long long)(x1 - x0) * (y1 - r.y0);
    }
    long long holes = (long long)g.widthBase * g.heightBase - covered;
    if (best < 0 || holes < best) {
      best = holes;
      window = a;
    }
  }
  return best;
}

namespace {

std::vector<int> identityOrder(const Cell& cell) {
  std::vector<int> o(cell.units);
  std::iota(o.begin(), o.end(), 0);
  return o;
}

// Tallest cells first (deepest on average among equals); with --vert-inside
// the standing cells go to the bottom in a feasible order.
std::vector<int> cellsByHeight(const Problem& p, const std::vector<Cell>& cells, const Pile& pile) {
  std::vector<int> cs = pile.cells;
  std::stable_sort(cs.begin(), cs.end(), [&](int a, int b) {
    if (cells[a].height != cells[b].height) return cells[a].height > cells[b].height;
    return (long long)cells[a].depthSum * (long long)cells[b].boxes.size() >
           (long long)cells[b].depthSum * (long long)cells[a].boxes.size();
  });
  std::vector<int> standing;
  if (p.vertInside && standingOrder(cells, cs, p.geo.heightBase, standing) && !standing.empty()) {
    std::vector<int> rest;
    for (int ci : cs)
      if (cells[ci].vertTop == 0) rest.push_back(ci);
    cs = standing;
    cs.insert(cs.end(), rest.begin(), rest.end());
  }
  return cs;
}

// Cells narrower than their pile push the slack toward the nearer shelf
// edge (leftmost pile left, rightmost right, others by their middle), so
// edge slack can land in the reserve outside the window.
template <class UnitOrder>
void emitPile(const Pile& pile, const std::vector<Cell>& cells, const std::vector<int>& cellOrder,
              UnitOrder&& unitOrderOf, int x, int shelfWidth, int pileSlot, std::vector<Rect>& out,
              std::vector<int>& rectPile) {
  bool slackLeft = x == 0                             ? true
                   : x + pile.width == shelfWidth ? false
                                                  : 2 * x + pile.width < shelfWidth;
  int y = 0;
  for (int ci : cellOrder) {
    const Cell& cell = cells[ci];
    int xOff = slackLeft ? pile.width - cell.width : 0;
    for (int u : unitOrderOf(ci)) {
      int left = unitLeft(cell, u);
      for (const Placement& pl : cell.boxes)
        if (pl.unit == u) {
          out.push_back({pl.o.box, x + xOff + (pl.xOff - left), y + pl.yOff, pl.o.fw, pl.o.fh,
                         pl.o.d, pl.o.vert});
          rectPile.push_back(pileSlot);
        }
      xOff += unitWidth(cell, u);
    }
    y += cell.height;
  }
}

class Arranger {
 public:
  Arranger(const Problem& p, const ShelfCandidates& shelf, const std::vector<int>& piles,
           ArrangeStats& stats)
      : p_(p), cells_(shelf.cells), allPiles_(shelf.piles), chosen_(piles), stats_(stats) {
    stats_.groupFailures.resize(p.groups.size(), 0);
    for (int pi : chosen_) {
      mask_ |= allPiles_[pi].mask;
      width_ += allPiles_[pi].width;
    }
    for (int gi = 0; gi < (int)p.groups.size(); gi++)
      if (mask_.contains(p.groups[gi].members)) {
        clusters_.push_back(gi);
        clusterBoxes_ |= p.groups[gi].members;
      }
  }

  std::optional<ShelfLayout> run() {
    stats_.attempts++;
    splitPiles();
    collectPermutableCells();
    for (const std::vector<int>& order : candidateOrders()) {
      if (tries_ > tuning::kArrangeTries) break;
      unitOrder_ = order;
      if (permuteBlocks(0)) {
        ShelfLayout out;
        out.pileOrder = sequence(unitOrder_);
        out.rects = layout_;
        out.rectPile = rectPile_;
        out.width = width_;
        out.interiorHoles = interiorHoles(layout_, width_, p_.geo, out.window);
        return out;
      }
    }
    stats_.failed++;
    return std::nullopt;
  }

 private:
  struct PermCell {
    int cell;
    std::vector<std::vector<int>> perms;
  };

  bool touchesClusters(int pi) const { return allPiles_[pi].mask.intersects(clusterBoxes_); }

  // Free piles move one by one; the piles of clusters that share a pile
  // form one block, kept together.
  void splitPiles() {
    std::vector<int> clusterPiles;
    for (int pi : chosen_) (touchesClusters(pi) ? clusterPiles : free_).push_back(pi);
    std::stable_sort(free_.begin(), free_.end(),
                     [&](int a, int b) { return allPiles_[a].width > allPiles_[b].width; });
    std::vector<int> parent(clusters_.size());
    std::iota(parent.begin(), parent.end(), 0);
    auto find = [&](int v) {
      while (parent[v] != v) v = parent[v] = parent[parent[v]];
      return v;
    };
    auto groupOf = [&](size_t c) -> const Group& { return p_.groups[clusters_[c]]; };
    for (int pi : clusterPiles) {
      int first = -1;
      for (size_t c = 0; c < clusters_.size(); c++)
        if (allPiles_[pi].mask.intersects(groupOf(c).members)) {
          if (first < 0) first = (int)c;
          else parent[find((int)c)] = find(first);
        }
    }
    std::map<int, std::vector<int>> byRoot;
    for (int pi : clusterPiles)
      for (size_t c = 0; c < clusters_.size(); c++)
        if (allPiles_[pi].mask.intersects(groupOf(c).members)) {
          byRoot[find((int)c)].push_back(pi);
          break;
        }
    for (auto& [_, block] : byRoot) {
      std::sort(block.begin(), block.end());
      blocks_.push_back(block);
    }
  }

  // Unit orders worth permuting: cluster-carrying multi-unit cells, plus
  // every multi-unit cell of a pile whose units differ in height (a
  // full-height unit can then be moved under a box above).
  void collectPermutableCells() {
    auto add = [&](int ci) {
      const Cell& cell = cells_[ci];
      if (cell.units < 2 || permIndex_.count(ci)) return;
      PermCell pc{ci, {}};
      std::vector<int> order = identityOrder(cell);
      do pc.perms.push_back(order);
      while (std::next_permutation(order.begin(), order.end()));
      permIndex_[ci] = (int)perm_.size();
      perm_.push_back(std::move(pc));
    };
    for (int pi : chosen_)
      if (touchesClusters(pi))
        for (int ci : allPiles_[pi].cells)
          if (cells_[ci].mask.intersects(clusterBoxes_)) add(ci);
    for (int pi : chosen_) {
      bool uneven = false;
      for (int ci : allPiles_[pi].cells)
        for (const Placement& pl : cells_[ci].boxes)
          if (pl.yOff + pl.o.fh < cells_[ci].height) uneven = true;
      if (uneven)
        for (int ci : allPiles_[pi].cells) add(ci);
    }
    counter_.assign(perm_.size(), 0);
  }

  std::vector<int> sequence(const std::vector<int>& order) const {
    std::vector<int> seq;
    for (int u : order) {
      if (u < (int)free_.size()) seq.push_back(free_[u]);
      else
        for (int pi : blocks_[u - free_.size()]) seq.push_back(pi);
    }
    return seq;
  }

  std::vector<int> cellOrder(int pi) const {
    std::vector<int> cs = cellsByHeight(p_, cells_, allPiles_[pi]);
    if (!touchesClusters(pi)) return cs;
    // Standing cells stay at the bottom (--vert-inside), then cluster cells
    // (adjacency), then the rest.
    auto rank = [&](int ci) {
      if (p_.vertInside && cells_[ci].vertTop > 0) return 0;
      return cells_[ci].mask.intersects(clusterBoxes_) ? 1 : 2;
    };
    std::stable_sort(cs.begin(), cs.end(), [&](int a, int b) { return rank(a) < rank(b); });
    return cs;
  }

  template <class UnitOrder>
  void emit(const std::vector<int>& seq, UnitOrder&& unitOrderOf, std::vector<Rect>& out,
            std::vector<int>& rectPile) const {
    out.clear();
    rectPile.clear();
    int x = 0;
    for (size_t slot = 0; slot < seq.size(); slot++) {
      int pi = seq[slot];
      emitPile(allPiles_[pi], cells_, cellOrder(pi), unitOrderOf, x, width_, (int)slot, out,
               rectPile);
      x += allPiles_[pi].width;
    }
  }

  // Every cluster connected, and (--vert-inside) no standing box above the
  // nominal line — on the settled geometry.
  bool layoutHolds() {
    if (p_.vertInside)
      for (const Rect& r : layout_)
        if (r.vert && r.y1() > p_.geo.heightBase) {
          stats_.standingTop++;
          return false;
        }
    for (int gi : clusters_)
      if (!contactHolds(p_.groups[gi], layout_, p_.longEdge)) {
        stats_.groupFailures[gi]++;
        return false;
      }
    return true;
  }

  // Odometer over the permutable cells' unit orders.
  bool tryUnitOrders() {
    std::fill(counter_.begin(), counter_.end(), 0);
    auto unitOrderOf = [&](int ci) {
      auto it = permIndex_.find(ci);
      return it == permIndex_.end() ? identityOrder(cells_[ci])
                                    : perm_[it->second].perms[counter_[it->second]];
    };
    while (true) {
      if (++tries_ > tuning::kArrangeTries) return false;
      emit(sequence(unitOrder_), unitOrderOf, layout_, rectPile_);
      settle(layout_);
      if (layoutHolds()) return true;
      size_t k = 0;
      for (; k < counter_.size(); k++) {
        if (++counter_[k] < perm_[k].perms.size()) break;
        counter_[k] = 0;
      }
      if (k == counter_.size()) return false;
    }
  }

  // Odometer over each block's pile order.
  bool permuteBlocks(size_t bi) {
    if (tries_ > tuning::kArrangeTries) return false;
    if (bi == blocks_.size()) return tryUnitOrders();
    std::vector<int>& block = blocks_[bi];
    std::sort(block.begin(), block.end());
    do {
      if (permuteBlocks(bi + 1)) return true;
      if (tries_ > tuning::kArrangeTries) return false;
    } while (std::next_permutation(block.begin(), block.end()));
    return false;
  }

  // Orders of free piles and blocks: the default, and every choice of the
  // two edge units — ranked by the holes an unverified layout leaves.
  std::vector<std::vector<int>> candidateOrders() const {
    size_t n = free_.size() + blocks_.size();
    std::vector<std::pair<long long, std::vector<int>>> cands;
    auto score = [&](std::vector<int> order) {
      std::vector<Rect> lo;
      std::vector<int> rp;
      emit(sequence(order), [&](int ci) { return identityOrder(cells_[ci]); }, lo, rp);
      settle(lo);
      int window = 0;
      cands.emplace_back(interiorHoles(lo, width_, p_.geo, window), std::move(order));
    };
    std::vector<int> base(n);
    std::iota(base.begin(), base.end(), 0);
    score(base);
    for (size_t l = 0; l < n && n > 1; l++)
      for (size_t r = 0; r < n; r++) {
        if (l == r) continue;
        std::vector<int> order{(int)l};
        for (size_t k = 0; k < n; k++)
          if (k != l && k != r) order.push_back((int)k);
        order.push_back((int)r);
        score(std::move(order));
      }
    std::stable_sort(cands.begin(), cands.end(),
                     [](const auto& a, const auto& b) { return a.first < b.first; });
    std::vector<std::vector<int>> out;
    for (auto& [_, order] : cands) {
      if ((int)out.size() >= tuning::kArrangeOrders) break;
      out.push_back(std::move(order));
    }
    return out;
  }

  const Problem& p_;
  const std::vector<Cell>& cells_;
  const std::vector<Pile>& allPiles_;
  const std::vector<int>& chosen_;
  ArrangeStats& stats_;
  BoxSet mask_, clusterBoxes_;
  int width_ = 0;
  std::vector<int> clusters_;  // indices into p_.groups
  std::vector<int> free_;
  std::vector<std::vector<int>> blocks_;
  std::vector<PermCell> perm_;
  std::unordered_map<int, int> permIndex_;
  std::vector<size_t> counter_;
  std::vector<int> unitOrder_;
  std::vector<Rect> layout_;
  std::vector<int> rectPile_;
  long long tries_ = 0;
};

}  // namespace

std::optional<ShelfLayout> arrangeShelf(const Problem& p, const ShelfCandidates& shelf,
                                        const std::vector<int>& piles, ArrangeStats& stats) {
  return Arranger(p, shelf, piles, stats).run();
}

std::vector<Rect> layoutPile(const Problem& p, const std::vector<Cell>& cells, const Pile& pile) {
  std::vector<Rect> out;
  std::vector<int> rectPile;
  emitPile(pile, cells, cellsByHeight(p, cells, pile),
           [&](int ci) { return identityOrder(cells[ci]); }, 0, pile.width, 0, out, rectPile);
  settle(out);
  return out;
}

}  // namespace sp
