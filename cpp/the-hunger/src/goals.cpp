// Goal-following versions of Nosferatu, for Dracula's portfolio playouts: its
// imagined future self can commit to a multi-turn plan — the Forest's hunting
// grounds, a Rose at the Labyrinth, an early Tavern run — while an outbound trip
// still fits the deck's Speed budget home, then plays exactly like Nosferatu
// (whose sunrise risk brings it back). A plan is scored by its best goal, so the
// search sees a strategy's payoff whenever one exists.
#include <algorithm>

#include "hg/ai.hpp"
#include "hg/nosferatu.hpp"

namespace hg {

using namespace nos;

namespace {

/** Spaces from `sp` to the goal's target. */
int goalDist(const GameState& s, int goal, int sp) {
  const BoardData& b = boardOf(s);
  const Graph& g = graphOf(s);
  switch (goal) {
    case G_ROSE: return b.labyrinthDist[sp];
    case G_TAVERN: return g.dist[sp][b.tavern];
    case G_FOREST: {
      int best = 99;
      for (int i = 0; i < b.n; i++)
        if (b.spaces[i].region == R_FOREST) best = std::min(best, int(g.dist[sp][i]));
      return best;
    }
    default: return 0;
  }
}

int goalTarget(const GameState& s, int goal) {
  const BoardData& b = boardOf(s);
  return goal == G_ROSE ? b.labyrinth : goal == G_TAVERN ? b.tavern : -1;
}

/** Still worth heading for: not yet done, and there and back fits the budget. */
bool goalActive(const GameState& s, const PlayerState& p, int goal) {
  const BoardData& b = boardOf(s);
  switch (goal) {
    case G_ROSE:
      if (ownsRose(p) || s.roses.empty()) return false;
      break;
    case G_TAVERN:
      if (s.tavern.empty() || s.turn > 6 || p.pos == b.tavern) return false;
      break;
    case G_FOREST:
      if (b.spaces[p.pos].region == R_FOREST) return false;
      break;
    default: return false;
  }
  double pace = std::max(1.0, expectedHandSpeed(p) * 0.7);
  int target = goalTarget(s, goal);
  int back = target >= 0 ? safeDistance(s, target) : 26;  // the Forest's edge is ~26 from safety
  return goalDist(s, goal, p.pos) + back <= pace * (turnsAfter(s) + 1) * 0.85;
}

}  // namespace

int goalPick(const GameState& s, int seat, const Actions& legal, int goal) {
  if (!s.hasCurrent || goal == G_NONE) return heuristicPick(s, seat, legal);
  if (goal == G_RUN) return runnerPick(s, seat, legal, RunnerConfig{75, 9, 40, 30, 40, 0});
  if (goal == G_FOREST_RUN) return runnerPick(s, seat, legal, RunnerConfig{75, 9, 40, 30, 40, 1});
  const PlayerState& p = s.players[seat];
  const int L = int(legal.size());
  const BoardData& b = boardOf(s);
  if (s.current.step == ST_ACT) {
    if (goal == G_ROSE && p.pos == b.labyrinth)
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_ROSE) return i;
    if (goal == G_TAVERN && p.pos == b.tavern)
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_TAVERN) return i;
    return heuristicPick(s, seat, legal);
  }
  if (s.current.step != ST_MOVE || !goalActive(s, p, goal)) return heuristicPick(s, seat, legal);
  int here = goalDist(s, goal, p.pos);
  Best best;
  for (int i = 0; i < L; i++) {
    const Action& a = legal[i];
    int d = a.type == A_MOVE || a.type == A_MIST ? a.space : a.type == A_STAY ? p.pos : -1;
    if (d < 0) continue;
    int spent = a.type == A_MOVE ? a.spent : 0;
    double v = destinationValue(s, p, d, spent) + 1.5 * (here - goalDist(s, goal, d)) -
               (a.type == A_STAY ? 0.2 : 0);
    best.offer(i, v);
  }
  return best.idx >= 0 ? best.idx : heuristicPick(s, seat, legal);
}

}  // namespace hg
