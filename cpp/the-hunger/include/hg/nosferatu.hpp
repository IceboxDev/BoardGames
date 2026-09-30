#pragma once
// Nosferatu's building blocks (src/heuristic.cpp), shared with the bots that
// extend it (Carmilla). heuristic.cpp stays the single definition, so
// Nosferatu's parity with ai-heuristic.ts is untouched.
#include <algorithm>

#include "hg/engine.hpp"

namespace hg::nos {

inline int turnsAfter(const GameState& s) { return std::max(0, TURNS - int(s.turn)); }

inline int regionBonus(const GameState& s, int space) {
  int r = spaceOf(s, space).region;
  return r == R_FOREST ? 2 : r == R_PLAINS ? 1 : 0;
}

inline double jsMax(double a, double b) { return b > a ? b : a; }

/** argmax over the listed indices: the FIRST strictly greatest. */
struct Best {
  int idx = -1;
  double value = 0;
  void offer(int i, double v) {
    if (idx < 0 || v > value) {
      idx = i;
      value = v;
    }
  }
};

struct CtxCache {
  bool ready = false;
  Tally tallies[MAX_PLAYERS];
  int pre[MAX_PLAYERS];
  MissionContext ctx;
};

using Track = Vec<Card, CAP_PILE>[MAX_ROWS][3];

double expectedHandSpeed(const PlayerState& p);
double missionAffinity(const PlayerState& p, int card);
double pileValue(const GameState& s, const PlayerState& p, const Card* pile, int n, int space);
double roseValue(const GameState& s, int rose);
double bestHuntFrom(const GameState& s, const PlayerState& p, int space, int speedLeft);
double spaceValue(const GameState& s, const PlayerState& p, int space);
double risk(const GameState& s, const PlayerState& p, int space);
double castleArrivalValue(const GameState& s);
double destinationValue(const GameState& s, const PlayerState& p, int to, int spent);
double discardBadness(const GameState& s, int id);
double missionEstimate(const GameState& s, const PlayerState& p, int seat, int id, CtxCache& cache);
int pickInstant(const GameState& s, const PlayerState& p, int seat, const Actions& legal);
int firstOf(const Actions& legal, int8_t type);
double bestOn(const GameState& s, const PlayerState& p, const Track& track, int here);

}  // namespace hg::nos
