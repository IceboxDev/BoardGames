// What to pack and under which rules — the CLI resolves every flag into a
// Problem, and everything downstream reads only this.
#pragma once
#include <string>
#include <vector>

#include "sp/box_set.hpp"
#include "sp/boxes.hpp"

namespace sp {

// What a packing is judged by.
enum class Objective {
  // Most packed volume, minus the reserve-spill penalty (the default).
  MaxVolume,
  // `--fill-all`: every shelf rectangle completely filled; fewest holes
  // inside the nominal windows, then least spill.
  FillAll,
};

// How the members of a group must touch once they are all placed.
enum class Contact {
  // One connected cluster by side or corner contact. A `--long-edge` box
  // only counts contacts along its long edge with a positive overlap.
  Touch,
  // Connected, where every counted contact lies along the long edge of BOTH
  // boxes (`--requires`).
  LongEdgeBoth,
  // A strict run (`--stack`): a vertical tower (equal face widths and x,
  // each box directly on the previous) or a row of standing boxes (face
  // height >= width, equal heights, side by side with nothing between).
  StrictRun,
};

// Which subsets of a group may be placed.
enum class Presence {
  AllOrNone,  // `--together`, `--stack`
  Mandatory,  // `--require`, `--pair`: every member must be placed
  Requires,   // `--requires DEP,PROV`: DEP only with PROV (PROV alone is fine)
};

struct Group {
  std::string origin;  // the flag that declared it, for messages
  BoxSet members;
  Contact contact = Contact::Touch;
  Presence presence = Presence::AllOrNone;
  BoxSet dependents;  // Presence::Requires: placing any of these needs all members
};

// The front rectangle every shelf shares (mm).
struct Geometry {
  int widthBase = 850;   // nominal width
  int heightBase = 250;  // nominal height every pile must reach
  int overLeft = 30;     // reserve beside / above the window: allowed,
  int overRight = 30;    // but spilling into it is penalized
  int overTop = 35;
  int tolPerBox = 1;     // measurement tolerance per box (±mm)
  int widthSlack = 0;    // extra width mismatch a pile may absorb as holes
  int heightSlack = 0;   // how far below nominal a pile top may stop

  int maxWidth() const { return widthBase + overLeft + overRight; }
  int maxHeight() const { return heightBase + overTop; }
  // Side-by-side units in a cell, and a box on its support, match within this.
  int matchTol() const { return 2 * tolPerBox; }
  // Every cell of a pile is at most this much narrower than the pile.
  int pileWidthTol() const { return 2 * tolPerBox + widthSlack; }
};

inline constexpr int kMaxShelves = 4;
inline constexpr int kDefaultShelfDepth = 325;  // mm, when no --depth-max / --shelf

struct Problem {
  std::vector<Box> boxes;  // after --exclude
  Geometry geo;
  std::vector<int> shelfDepths;  // one per shelf, 1..kMaxShelves
  Objective objective = Objective::MaxVolume;
  int spillCost = 50;  // MaxVolume: % of full-depth volume charged per spilled mm²
  bool flatOnly = false;    // no standing (spine-out) orientations
  bool vertInside = false;  // standing boxes' tops stay under the nominal height
  bool useAll = false;      // every box must be placed
  BoxSet longEdge;          // --long-edge boxes
  BoxSet pinnedFirst;       // --pin-a boxes: only on the first shelf
  std::vector<Group> groups;

  BoxSet all() const { return BoxSet::firstN((int)boxes.size()); }
  int shelves() const { return (int)shelfDepths.size(); }
  BoxSet mandatory() const {
    BoxSet s;
    for (const Group& g : groups)
      if (g.presence == Presence::Mandatory) s |= g.members;
    return s;
  }
};

inline char shelfLetter(int shelf) { return char('A' + shelf); }

}  // namespace sp
