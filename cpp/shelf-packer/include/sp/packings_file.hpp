// packings.txt — the machine-readable result of a run, read back by --warm
// (to re-inject its piles and packings) and --verify (to re-check it).
//
//   shelf-packer packings v1
//   packing <rank>
//   shelf <letter> depth <mm> width <mm> window <mm>
//   pile <pile text>                       (left to right; see pile_text.hpp)
//   place <pile#> <name> <x0> <y0> <fw> <fh> <d>
//   end
//
// x0 is from the left edge of the leftmost pile, y0 up from the floor, both
// settled; `window` is where the nominal window starts on that axis. Pile
// numbers count from 1 in `pile` line order. Blank lines and # comments are
// ignored; any other deviation is an error.
#pragma once
#include <array>
#include <iosfwd>
#include <string>
#include <vector>

#include "sp/arrange.hpp"
#include "sp/search.hpp"

namespace sp {

inline constexpr const char* kPackingsHeader = "shelf-packer packings v1";
inline constexpr const char* kPackingsFile = "packings.txt";

// A packing chosen for output: what the search found, and how it stands.
struct Emitted {
  int rank = 0;
  Packing packing;
  std::array<ShelfLayout, kMaxShelves> layouts{};
  long long exactHoles = 0;  // Σ holes inside the nominal windows
};

void writePackingRecord(std::ostream& os, const Problem& p,
                        const std::vector<ShelfCandidates>& shelves, const Emitted& e);

struct PlaceRecord {
  int line = 0;
  int pile = 0;  // 1-based
  std::string name;
  int x0 = 0, y0 = 0, fw = 0, fh = 0, d = 0;
};
struct ShelfRecord {
  int line = 0;
  char letter = 'A';
  int depth = 0, width = 0, window = 0;
  std::vector<std::string> piles;
  std::vector<int> pileLines;
  std::vector<PlaceRecord> places;
};
struct PackingRecord {
  int line = 0;
  int rank = 0;
  std::vector<ShelfRecord> shelves;
};

// Throws InputError naming file:line on anything malformed.
std::vector<PackingRecord> readPackingsFile(const std::string& path);

}  // namespace sp
