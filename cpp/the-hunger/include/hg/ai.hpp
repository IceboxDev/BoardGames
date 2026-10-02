// AI ports: Nosferatu (ai-heuristic.ts), determinize (search/determinize.ts),
// the rollout policy (search/rollout.ts) and Strigoi (search/strigoi.ts).
#pragma once
#include <string>
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
   * Share of the utility that is survival alone: (1 - w)·tier utility + w·survived.
   * Burning is catastrophic at a real table, so a losing seat still runs home.
   */
  double survival = 0;
  /**
   * Playouts use the rival model (dracula.cpp rivalPick): doomed Vampires push
   * rivals on the last turn, late pushes aim away from the nearest safe space.
   */
  bool rivals = true;
  /** The searcher's own future turns in playouts: 0 = as rivals, 1 = Carmilla. */
  int selfPolicy = 0;
  /** Learned playout policy for every seat (rollpol.hpp); null = Nosferatu / the rival model. */
  const struct RollPolicy* pol = nullptr;
  /**
   * Portfolio playouts: bit g set = also play the searcher's future turns by goal g
   * (Goal); a plan scores its best goal. 0 = off (one playout policy).
   */
  int goals = 0;
  /** Play the rest of the chosen whole-turn plan without re-searching while nothing is revealed. */
  bool followPlan = false;
  /** Parameters for the G_EXEC goal (set with goals bit 64). */
  const struct ExecParams* exec = nullptr;
  /**
   * Commitment: utility added to the G_EXEC line, so the search keeps executing
   * the optimised plan unless another line is better by more than this (stops
   * re-picking between close lines move by move). Percent of a utility point.
   */
  int execBias = 0;
  /** Add each portfolio goal's own line for this turn to the candidate plans. */
  bool goalArms = false;
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
/**
 * Carmilla (src/carmilla.cpp): scripted expert. Integer knobs are tenths unless
 * noted, so a bench spec can set them (`carmilla:tavern=40,goal=20`).
 */
struct CarmillaConfig {
  int pace = 70;       // % of the mean hand's Speed counted as distance per turn
  bool rose = true;    // go for a Rose when the round trip fits
  int roseBonus = 6;   // VP-equivalent on top of the Rose's own value
  int tavern = 35;     // tenths of a VP per Tavern card
  int deck = 20;       // early Familiar / Power bonus (tenths, scaled by Speed)
  int confuse = 20;    // outbound Confuse bonus (tenths)
  int digest = 10;     // extra wish to digest (tenths)
  int goal = 15;       // tenths of a VP per space gained toward the Labyrinth
};
int carmillaPick(const GameState& s, int seat, const Actions& legal, const CarmillaConfig& cfg = {});

/** Plan helpers (dracula.cpp): same action; still the root turn and `seat` decides; a move revealed hidden info. */
bool sameAction(const Action& a, const Action& b);
bool stillMine(const GameState& s, const GameState& root, int seat);
bool revealed(const GameState& a, const GameState& b, int seat);

/** The rival model's late-night rules (doomed Vampire pushes; pushes aimed off safety), or −1. */
int spiteRule(const GameState& s, int seat, const Actions& legal);

/** Goals for Dracula's portfolio playouts (src/goals.cpp). */
enum Goal { G_NONE = 0, G_FOREST = 1, G_ROSE = 2, G_TAVERN = 3, G_RUN = 4, G_FOREST_RUN = 5, G_EXEC = 6, NUM_GOALS = 7 };
/** The parametrised plan executor (src/exec.cpp); its 14 numbers are found by train/exec_opt.py. */
constexpr int EXEC_PARAMS = 14;
struct ExecParams {
  bool loaded = false;
  float x[EXEC_PARAMS] = {};
  bool load(const std::string& path);
};
int execPick(const GameState& s, int seat, const Actions& legal, const ExecParams& params);

/** Nosferatu following `goal` while it is still worth it (G_NONE = Nosferatu; G_EXEC needs `exec`). */
int goalPick(const GameState& s, int seat, const Actions& legal, int goal, const ExecParams* exec = nullptr);

/** The Rose run (src/runner.cpp): race out for a Rose, hunt back under a real budget home. */
struct RunnerConfig {
  int pace = 75;        // % of the mean hand's Speed counted per turn
  int lastOutTurn = 9;  // no Rose trip starts after this turn
  int margin = 20;      // tenths of a space of slack kept on the way back
  int chest = 30;       // tenths of a VP for an unopened Chest on the way out
  int tavern = 40;      // tenths of a VP for an early Tavern stop on the way out
  int target = 0;       // 0: the Labyrinth (a Rose); 1: the Forest's hunting grounds
};
int runnerPick(const GameState& s, int seat, const Actions& legal, const RunnerConfig& cfg = {});

/** Castle or Cemetery (or the Mountains when they are safe under the table's rules). */
bool safeSpace(const GameState& s, int sp);
/** Spaces from `sp` to the nearest safe space. */
int safeDistance(const GameState& s, int sp);

/** Print every arm's value and survival rate to stderr (the `hg explain` probe). */
extern bool g_draculaDebug;
/** draculaPick: the INDEX into `legal`. */
int draculaPick(const GameState& s, int seat, const Actions& legal, const DraculaConfig& cfg = {});
/** Tier-aware utility (see DraculaConfig::tierMargin). */
double tierUtility(const GameState& s, int seat, double survival = 0);

/** V8's Math.exp: the fdlibm algorithm, bit-for-bit. */
double jsExp(double x);

}  // namespace hg
