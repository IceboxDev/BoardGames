#pragma once
// Lilith — search guided by a learned policy and value (src/net.cpp).
//
// Lilith-0: the seat's whole-turn plans (every distinct sequence of its own
// decisions this turn, cut at the first move that reveals hidden information,
// children ordered and pruned by the policy head), each scored by the value
// head at the plan's end — averaged over sampled worlds when the plan ends in a
// reveal. No Nosferatu rollouts: the value head sees the whole game.
#include <vector>

#include "hg/net.hpp"

namespace hg {

struct LilithConfig {
  int worlds = 8;        // worlds for plans that end in a reveal
  int rootBranch = 32;   // root moves kept (by policy prior)
  int branch = 6;        // moves kept per later plan step
  int maxLeaves = 400;   // plan budget
  double placeW = 0.1;   // utility = P(win) + placeW · placement
  double temp = 0;       // > 0: sample the move ∝ exp(Q / temp) (self-play)
  int vmode = 0;         // 0: win head; 1: score race (survival + predicted final scores)
  int horizon = 0;       // 0: value at the plan's end; 1: rivals play (policy argmax) until my next turn
};

/**
 * Lilith's move (index into `legal`). `rootQ` (optional) receives each legal
 * move's value (−1 if pruned) — the self-play policy target.
 */
int lilithPick(const GameState& s, int seat, const Actions& legal, const Net& net,
               const LilithConfig& cfg, std::vector<float>* rootQ = nullptr, double u01 = 0.5);

/** The value head's utility for `seat` at `s` (true result when the game is over). */
double lilithValue(const GameState& s, int seat, const Net& net, double placeW, int vmode = 0);

}  // namespace hg
