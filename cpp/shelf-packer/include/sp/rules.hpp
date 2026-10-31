// What makes a packing legal, independent of how it was found. The search,
// the arrangement and `--verify` all judge packings with these functions.
#pragma once
#include <span>
#include <string>
#include <vector>

#include "sp/problem.hpp"

namespace sp {

// One placed box, seen from the front. y0 is measured up from the floor.
struct Rect {
  int box = -1;
  int x0 = 0, y0 = 0, fw = 0, fh = 0, d = 0;
  bool vert = false;  // standing: the box's own height lies horizontal
  int x1() const { return x0 + fw; }
  int y1() const { return y0 + fh; }
};

// Shared side or corner (closed rectangles).
bool touches(const Rect& a, const Rect& b);
// The contact lies along one of c's LONG edges with a positive overlap (a
// corner point does not count). Square faces have four long edges.
bool longEdgeContact(const Rect& c, const Rect& o);
// Standing boxes in a row may sit this far apart vertically after settling:
// their long sides still meet over all but a sliver.
inline constexpr int kRowSettleToleranceMm = 3;
bool formsStrictRun(std::span<const Rect> members);

// The group's contact rule on a settled layout that holds all its members.
bool contactHolds(const Group& g, std::span<const Rect> layout, BoxSet longEdge);

// Presence rules over everything placed (all shelves together).
bool presenceHolds(const Group& g, BoxSet placed);
// Placed members that are worthless as things stand — half an all-or-none
// group, or dependents without their providers. The search discounts them.
BoxSet strandedMembers(const Group& g, BoxSet placed);
// Members on two different shelves can never be repaired: every rule needs
// a group, once fully placed, on one shelf.
bool splitAcrossShelves(const Group& g, std::span<const BoxSet> shelves);

// Every group's presence rule, and no group split across shelves. On
// failure, `why` (if given) names the group.
bool groupsHold(const Problem& p, std::span<const BoxSet> shelves, std::string* why = nullptr);
// groupsHold plus --use-all.
bool membershipHolds(const Problem& p, std::span<const BoxSet> shelves,
                     std::string* why = nullptr);

}  // namespace sp
