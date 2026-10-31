// Piles that outlive a run: the persistent column library (--library) and
// previous runs' packings (--warm). Both come back through ExternalPiles,
// so a column that no longer fits the current boxes or rules is dropped
// (and counted) instead of entering the search.
//
// Library file:
//   # shelf-packer column library v1
//   L <pile text>
// Older files tagged each line `L ws=N hs=N : <pile text>`; the tags are
// ignored now that every column is checked against the current rules.
#pragma once
#include <array>
#include <iosfwd>
#include <map>
#include <string>
#include <vector>

#include "sp/candidates.hpp"

namespace sp {

inline constexpr const char* kLibraryHeader = "# shelf-packer column library v1";

struct ExternalLoad {
  int read = 0;                                 // columns / packings read
  std::array<int, kMaxShelves> admitted{};      // piles admitted per shelf
  std::map<std::string, int> rejected;          // reason → count
  void print(std::ostream& os, const std::string& what) const;
};

// A missing file is an empty library.
ExternalLoad loadLibrary(const std::string& path, const Problem& p,
                         std::vector<ExternalPiles>& admit);

// Re-mines every pile this run knows into a fresh library: per box and per
// touching box pair, the cleanest columns, plus every `keep` line. Written
// to a temporary file and renamed into place.
void saveLibrary(const std::string& path, const Problem& p,
                 const std::vector<ShelfCandidates>& shelves, const std::vector<std::string>& keep);

struct WarmPacking {
  std::array<std::vector<int>, kMaxShelves> piles;  // admitted pile indices per shelf
  std::string source;
};
std::vector<WarmPacking> loadWarm(const std::string& dir, const Problem& p,
                                  std::vector<ExternalPiles>& admit, ExternalLoad& load);

}  // namespace sp
