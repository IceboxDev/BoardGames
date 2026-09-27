// AI ports: Nosferatu (ai-heuristic.ts), determinize (search/determinize.ts),
// the rollout policy (search/rollout.ts) and Strigoi (search/strigoi.ts).
#pragma once
#include "hg/engine.hpp"

namespace hg {

/** heuristicPick: the INDEX into `legal` of Nosferatu's choice. */
int heuristicPick(const GameState& s, int seat, const Actions& legal);

/** determinize: one world consistent with `observer`'s view. */
GameState determinize(const GameState& s, int observer, Mulberry32& rand);

/** playout: Nosferatu for every seat to sunrise, in place. */
void playout(GameState& s, int maxSteps = 5000);
/** outcomeUtility: a finished game's value for `seat` in [0, 1]. */
double outcomeUtility(const GameState& s, int seat);

struct StrigoiConfig {
  int rollouts = 96;
  int minPerArm = 4;
};
/** strigoiPick (rollout-budget mode): the INDEX into `legal`. */
int strigoiPick(const GameState& s, int seat, const Actions& legal, const StrigoiConfig& cfg = {});

/**
 * Dracula (C++ only): the search behind the top tier. Rollout-budget mode when
 * `timeMs` is 0 (reproducible benches), otherwise wall-clock. Grows beyond
 * Strigoi through the flags below; each is benched before it becomes default.
 */
struct DraculaConfig {
  int rollouts = 4000;
  int minPerArm = 8;
  double timeMs = 0;
  /** Margin term against same-survival-tier rivals (survivors outrank the burnt). */
  bool tierMargin = true;
  /**
   * Arms are whole own-turn PLANS (every distinct sequence of the seat's
   * remaining decisions this turn, cut at the first move that reveals hidden
   * information) instead of single moves; the first move of the best plan is
   * played. Fixes judging a move by Nosferatu's continuation of the turn.
   */
  bool turnPlans = true;
  /** Cap on enumerated plans (Nosferatu's line is always enumerated first). */
  int maxPlans = 256;
};
/** draculaPick: the INDEX into `legal`. */
int draculaPick(const GameState& s, int seat, const Actions& legal, const DraculaConfig& cfg = {});
/** Tier-aware utility (see DraculaConfig::tierMargin). */
double tierUtility(const GameState& s, int seat);

/** V8's Math.exp: the fdlibm algorithm, bit-for-bit. */
double jsExp(double x);

}  // namespace hg
