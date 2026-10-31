// Choosing piles for every shelf: beam passes over several pile orders plus
// randomized greedy restarts. States are scored lexicographically (see
// scoreState) and states that can never become legal are dropped on the
// spot, so no penalty weight has to outbid a box's volume.
#pragma once
#include <array>
#include <map>
#include <string>
#include <vector>

#include "sp/candidates.hpp"
#include "sp/problem.hpp"

namespace sp {

// A complete packing as the search found it (arrangement comes later).
struct Packing {
  std::array<BoxSet, kMaxShelves> masks{};
  std::array<int, kMaxShelves> widths{};
  std::array<std::vector<int>, kMaxShelves> piles{};  // pile indices per shelf
  long long vol = 0, depthSum = 0;
  long long holes = 0;  // Σ pile holes
  long long spill = 0;  // front area in the reserve (mm²)
  long long value = 0;  // MaxVolume: volume minus the spill penalty
  std::string source;   // which search phase found it
  BoxSet placed() const {
    BoxSet s;
    for (const BoxSet& m : masks) s |= m;
    return s;
  }
};

struct SearchStats {
  long long completed = 0;    // states that met the objective's completeness
  long long incomplete = 0;   // FillAll: a shelf short of the nominal width
  long long membership = 0;   // complete, but a presence rule or --use-all failed
  long long dead = 0;         // extensions dropped: a group split across shelves
  // Closest attempts, for the "nothing found" report.
  long long bestCovered = -1;
  std::array<std::vector<int>, kMaxShelves> bestPileWidths{};
  int bestPlaced = -1;
  BoxSet bestPlacedMask;
  std::vector<std::pair<std::string, double>> phaseSeconds;
};

class Search {
 public:
  Search(const Problem& p, const std::vector<ShelfCandidates>& shelves);

  // A previous run's packing (pile indices per shelf); conflicting piles
  // are skipped, and the result competes like any other.
  void seed(const std::array<std::vector<int>, kMaxShelves>& piles, const std::string& source);
  void run(uint64_t seed);
  // Best first: MaxVolume by value then depth; FillAll by holes then spill.
  std::vector<Packing> ranked() const;
  const SearchStats& stats() const { return stats_; }

 private:
  struct State;
  using Score = std::array<long long, 5>;  // lexicographic, larger is better

  void extendInto(const State& s, int pile, State& out) const;
  bool canExtend(const State& s, int pile) const;
  Score scoreState(const State& s) const;
  bool complete(const State& s) const;
  void collect(const State& s, const std::string& source);
  void beam(const std::vector<int>& order, int width, const std::string& source);
  void greedy(int iterations, uint64_t seed, const std::string& source);
  std::vector<int> order(bool (*less)(const Pile&, const Pile&)) const;
  std::vector<int> pinnedOrder(const std::vector<int>& order, int mandatoryShelf,
                               int optionalShelf) const;
  bool better(const State& a, const State& b) const;
  bool betterPacking(const Packing& a, const Packing& b) const;

  const Problem& p_;
  const std::vector<ShelfCandidates>& shelves_;
  // Piles of all shelves under one id space.
  std::vector<int> shelfOf_, indexOf_;
  std::vector<const Pile*> pile_;
  BoxSet mandatory_, groupBoxes_;
  std::map<std::array<BoxSet, kMaxShelves>, Packing> pool_;
  SearchStats stats_;
};

}  // namespace sp
