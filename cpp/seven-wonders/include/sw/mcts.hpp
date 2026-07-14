// Simultaneous-move MCTS. Two modes over the same tree:
//   - net == nullptr : M0 — uniform priors + random rollouts (decoupled UCB).
//   - net != nullptr : PUCT — net policy priors + net value at leaves (AlphaZero).
// Every active seat runs its own bandit over its legal moves; the joint move
// descends the shared tree. Per-seat rank reward in [0,1] (general-sum).
#pragma once
#include <cstdint>
#include <vector>

#include "sw/move.hpp"
#include "sw/net.hpp"
#include "sw/state.hpp"

namespace sw {

struct MctsConfig {
  int iterations = 800;
  double c = 1.5;
  double temperature = 0.0;    // >0 = sample root move ~ visits^(1/T); 0 = argmax
  bool heuristicRollout = true;  // playout policy: balanced heuristic (vs uniform random)
  uint32_t seed = 12345;
};

// Root visit statistics for every active seat (used by self-play to build policy
// targets, and to pick each seat's move).
struct RootStats {
  int numActive = 0;
  int active[N] = {};
  std::vector<Move> moves[N];
  std::vector<int> visits[N];
};

RootStats mctsSearch(const GameState& st, const MctsConfig& cfg, const Net* net);

// Convenience: pick seat `me`'s move (argmax visits, or sampled if temperature>0).
Move mctsChooseMove(const GameState& st, int me, const MctsConfig& cfg, const Net* net = nullptr);

// Imperfect-information move for `me`: ensemble PIMC over `dets` determinizations
// (phase-adaptive — falls back to perfect-info search once nothing is unknown).
// `trueState` is used only to sample consistent hidden hands; me's decision does
// not depend on the true hidden assignment.
Move ismctsChooseMove(const GameState& trueState, int me, const MctsConfig& cfg, const Net* net,
                      int dets);

}  // namespace sw
