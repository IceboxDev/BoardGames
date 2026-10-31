// From a shelf's chosen piles to a concrete, settled front view: the pile
// order, the order of cells inside each pile and of units inside each cell,
// searched until every group on the shelf meets its contact rule.
#pragma once
#include <optional>
#include <vector>

#include "sp/candidates.hpp"
#include "sp/rules.hpp"

namespace sp {

struct ShelfLayout {
  std::vector<int> pileOrder;  // pile indices, left to right
  std::vector<Rect> rects;     // settled
  std::vector<int> rectPile;   // per rect: its position in pileOrder
  int width = 0;               // Σ pile widths
  int window = 0;              // x of the nominal window's left edge
  long long interiorHoles = 0; // holes inside the nominal window
};

struct ArrangeStats {
  long long attempts = 0;        // shelves arranged
  long long failed = 0;          // shelves no layout satisfied
  long long standingTop = 0;     // layouts with a standing box above the line
  std::vector<long long> groupFailures;  // per Problem::groups index
};

std::optional<ShelfLayout> arrangeShelf(const Problem& p, const ShelfCandidates& shelf,
                                        const std::vector<int>& piles, ArrangeStats& stats);

// Gravity: every box drops to the highest settled top below it that it
// overlaps, or the floor. Boxes stay level.
void settle(std::vector<Rect>& layout);

// Holes inside the nominal window, minimized over the window's position
// (the layout may overhang each side by the reserve).
long long interiorHoles(const std::vector<Rect>& layout, int width, const Geometry& g,
                        int& window);

// One pile alone at x = 0, settled (the library mines contacts from these).
std::vector<Rect> layoutPile(const Problem& p, const std::vector<Cell>& cells, const Pile& pile);

}  // namespace sp
