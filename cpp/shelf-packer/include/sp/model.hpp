// The packing model, bottom-up:
//   Orient — a box turned so one face shows (fw × fh), d going into the shelf.
//   Unit   — one box, or a column of boxes each resting on the one below.
//   Cell   — units standing side by side, their heights matching.
//   Pile   — cells stacked flush to one width; the shelf is a row of piles.
// Cells and piles are only ever built through makeCell / composePile, so
// their derived numbers (width, holes, volume…) have one definition.
#pragma once
#include <algorithm>
#include <span>
#include <vector>

#include "sp/box_set.hpp"
#include "sp/boxes.hpp"
#include "sp/problem.hpp"

namespace sp {

struct Orient {
  int box = -1;
  int fw = 0, fh = 0, d = 0;  // face width, face height, depth into the shelf
  bool vert = false;          // standing: the box's own height lies horizontal
  bool operator==(const Orient&) const = default;
};

// A box inside a cell. xOff/yOff are from the cell's bottom-left corner.
struct Placement {
  Orient o;
  int xOff = 0, yOff = 0;
  int unit = 0;  // which side-by-side unit of the cell
};

// Bottom box first.
using UnitStack = std::vector<Orient>;

struct Cell {
  BoxSet mask;
  int width = 0, height = 0;  // height = tallest unit
  long long vol = 0;
  long long faceArea = 0;  // Σ fw × fh of the members (for the hole metric)
  int depthSum = 0, maxDepth = 0;
  int vertTop = 0;  // highest top of a standing member above the cell base (0 = none)
  int units = 0;
  std::vector<Placement> boxes;  // unit by unit, bottom to top
};

struct Pile {
  BoxSet mask;
  int width = 0, height = 0;  // width = widest cell, height = Σ cell heights
  long long vol = 0;
  int depthSum = 0, maxDepth = 0;
  // Pile rectangle (up to at least the nominal height) minus the members'
  // faces: the mismatch gaps a pile carries.
  long long holes = 0;
  std::vector<int> cells;  // indices into the shelf's cell list
  int layers() const { return (int)cells.size(); }
};

// Lays the units out left to right; boxes above a unit's bottom box are
// centered over it.
Cell makeCell(std::span<const UnitStack> units, const std::vector<Box>& boxes);
std::vector<UnitStack> unitsOf(const Cell& cell);
int unitHeight(const Cell& cell, int unit);
int unitLeft(const Cell& cell, int unit);
int unitWidth(const Cell& cell, int unit);
bool hasColumn(const Cell& cell);  // some box rests on another inside the cell

Pile composePile(const std::vector<Cell>& cells, std::vector<int> cellIdx, int heightBase);

// The order standing cells must take, bottom up, so every standing box's
// top stays under the nominal height (--vert-inside). Empty `order` with
// true = no standing cells; false = no order works.
bool standingOrder(const std::vector<Cell>& cells, std::span<const int> pileCells,
                   int heightBase, std::vector<int>& order);

// Front area a pile pushes above the nominal height.
inline long long topOverArea(const Pile& pile, int heightBase) {
  return (long long)pile.width * std::max(0, pile.height - heightBase);
}

}  // namespace sp
