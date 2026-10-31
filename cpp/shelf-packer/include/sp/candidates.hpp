// Per shelf: every way a box can face out, the cells those faces form, and
// the piles the search assembles packings from. Every pile — enumerated,
// injected tower, library column or warm-start pile — passes checkPile.
#pragma once
#include <array>
#include <map>
#include <string>
#include <unordered_set>
#include <vector>

#include "sp/model.hpp"
#include "sp/pile_text.hpp"
#include "sp/problem.hpp"

namespace sp {

enum class PileFault {
  None,
  Support,      // a box wider than the box it rests on
  CellHeights,  // side-by-side units whose heights do not match
  PileWidth,    // a cell narrower than the pile allows
  PileHeight,   // short of the nominal height, or past the top reserve
  StandingTop,  // --vert-inside: a standing box pokes above the nominal height
  Group,        // can never satisfy a group rule (see groupAllows)
  Count,
};
const char* describe(PileFault f);

struct ShelfCandidates {
  int shelf = 0;
  int depth = 0;
  std::vector<Orient> orients;
  std::vector<Cell> cells;
  std::vector<Pile> piles;
};

struct CandidateStats {
  long long enumerated = 0;  // piles out of the enumeration (deduped by box set)
  long long pruned = 0;      // dropped by the FillAll quota
  long long towers = 0;      // canonical stack towers injected
  std::array<long long, (size_t)PileFault::Count> rejected{};
};

std::vector<Orient> buildOrients(const Problem& p, int shelf);
std::vector<Cell> buildCells(const Problem& p, const std::vector<Orient>& orients);
ShelfCandidates buildShelf(const Problem& p, int shelf, CandidateStats& stats);

PileFault checkPile(const Problem& p, const std::vector<Cell>& cells, const Pile& pile);

// Adds piles that come from outside the enumeration (library, warm start)
// after checking they still describe legal piles for the current boxes,
// shelf and rules. Exact duplicates of a pile already present map to it.
class ExternalPiles {
 public:
  ExternalPiles(const Problem& p, ShelfCandidates& shelf);
  // The pile's index, or -1 with `why` set.
  int admit(const PileSpec& spec, std::string& why);

 private:
  std::string canonicalKey(const Pile& pile) const;

  const Problem& p_;
  ShelfCandidates& shelf_;
  std::map<std::string, int> byKey_;
};

}  // namespace sp
