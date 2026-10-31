#include "sp/model.hpp"

#include <algorithm>
#include <climits>

namespace sp {

Cell makeCell(std::span<const UnitStack> units, const std::vector<Box>& boxes) {
  Cell c;
  int x = 0;
  for (int u = 0; u < (int)units.size(); u++) {
    const UnitStack& stack = units[u];
    int unitW = 0, y = 0;
    for (const Orient& o : stack) unitW = std::max(unitW, o.fw);
    for (size_t k = 0; k < stack.size(); k++) {
      const Orient& o = stack[k];
      int center = k == 0 ? 0 : std::max(0, (stack[0].fw - o.fw) / 2);
      c.boxes.push_back({o, x + center, y, u});
      c.mask.add(o.box);
      c.vol += boxes[o.box].vol;
      c.faceArea += (long long)o.fw * o.fh;
      c.depthSum += o.d;
      c.maxDepth = std::max(c.maxDepth, o.d);
      if (o.vert) c.vertTop = std::max(c.vertTop, y + o.fh);
      y += o.fh;
    }
    c.height = std::max(c.height, y);
    x += unitW;
  }
  c.width = x;
  c.units = (int)units.size();
  return c;
}

std::vector<UnitStack> unitsOf(const Cell& cell) {
  std::vector<UnitStack> units(cell.units);
  for (const Placement& pl : cell.boxes) units[pl.unit].push_back(pl.o);  // stored bottom-up
  return units;
}

int unitHeight(const Cell& cell, int unit) {
  int h = 0;
  for (const Placement& pl : cell.boxes)
    if (pl.unit == unit) h = std::max(h, pl.yOff + pl.o.fh);
  return h;
}

int unitLeft(const Cell& cell, int unit) {
  int lo = INT_MAX;
  for (const Placement& pl : cell.boxes)
    if (pl.unit == unit) lo = std::min(lo, pl.xOff);
  return lo;
}

int unitWidth(const Cell& cell, int unit) {
  int lo = unitLeft(cell, unit), w = 0;
  for (const Placement& pl : cell.boxes)
    if (pl.unit == unit) w = std::max(w, pl.xOff - lo + pl.o.fw);
  return w;
}

bool hasColumn(const Cell& cell) {
  for (const Placement& pl : cell.boxes)
    if (pl.yOff > 0) return true;
  return false;
}

Pile composePile(const std::vector<Cell>& cells, std::vector<int> cellIdx, int heightBase) {
  Pile pile;
  long long faceArea = 0;
  for (int ci : cellIdx) {
    const Cell& c = cells[ci];
    pile.mask |= c.mask;
    pile.width = std::max(pile.width, c.width);
    pile.height += c.height;
    pile.vol += c.vol;
    pile.depthSum += c.depthSum;
    pile.maxDepth = std::max(pile.maxDepth, c.maxDepth);
    faceArea += c.faceArea;
  }
  pile.holes = (long long)pile.width * pile.height - faceArea +
               (long long)pile.width * std::max(0, heightBase - pile.height);
  pile.cells = std::move(cellIdx);
  return pile;
}

bool standingOrder(const std::vector<Cell>& cells, std::span<const int> pileCells,
                   int heightBase, std::vector<int>& order) {
  order.clear();
  for (int ci : pileCells)
    if (cells[ci].vertTop > 0) order.push_back(ci);
  if (order.empty()) return true;
  std::sort(order.begin(), order.end());
  do {
    int base = 0;
    bool ok = true;
    for (int ci : order) {
      if (base + cells[ci].vertTop > heightBase) {
        ok = false;
        break;
      }
      base += cells[ci].height;
    }
    if (ok) return true;
  } while (std::next_permutation(order.begin(), order.end()));
  order.clear();
  return false;
}

}  // namespace sp
