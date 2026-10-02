// A parametrised plan executor: the Rose run generalised into 14 numbers, so
// the plan for a table size can be FOUND by optimisation (train/exec_opt.py,
// CMA-ES vs Nosferatu fields) instead of written by hand. It serves as a goal
// for Dracula's portfolio playouts (G_EXEC), like the Rose run (G_RUN).
//
//   OUT  (until turn `lastOut`): each destination scores weighted progress toward
//        the Labyrinth (while a Rose is free) and the Forest, Chests, an early
//        Tavern, Crypts with Missions, ending in the Plains — minus the real
//        budget home; out-phase hunting weighs Human VP, negative Speed and
//        Powers / Familiars against a threshold.
//   BACK Nosferatu's hunting with the budget home and a Forest preference.
#include <algorithm>
#include <cstdio>
#include <string>

#include "hg/ai.hpp"
#include "hg/nosferatu.hpp"

namespace hg {

using namespace nos;

namespace {

enum : int {
  X_PACE, X_MARGIN, X_LAST_OUT, X_LAB, X_FOREST, X_CHEST, X_TAVERN, X_CRYPT, X_PLAINS,
  X_OUT_HUMAN_VP, X_OUT_NEG_SPEED, X_OUT_POWER, X_BACK_FOREST, X_HUNT_MIN,
};
static_assert(X_HUNT_MIN + 1 == EXEC_PARAMS);

bool parasolLeft(const PlayerState& p) {
  if (p.parasolTurnUsed) return false;
  for (const BonusHolding& b : p.bonus)
    if (BONUS_DEFS[b.id].kind == BK_PARASOL) return true;
  return false;
}

double budgetRisk(const GameState& s, const PlayerState& p, int d, const float* x) {
  int left = turnsAfter(s) + (parasolLeft(p) ? 1 : 0);
  int sd = safeDistance(s, d);
  if (left == 0) {
    if (sd > 0) return 200 + p.vp;
    return spaceOf(s, d).region == R_CEMETERY ? 5 : 0;
  }
  double pace = std::max(1.0, expectedHandSpeed(p) * x[X_PACE]);
  double slack = pace * left - sd;
  return slack >= x[X_MARGIN] ? 0 : (x[X_MARGIN] - slack) * (5 + p.vp / 5.0);
}

int forestDist(const GameState& s, int sp) {
  const BoardData& b = boardOf(s);
  const Graph& g = graphOf(s);
  int best = 99;
  for (int i = 0; i < b.n; i++)
    if (b.spaces[i].region == R_FOREST) best = std::min(best, int(g.dist[sp][i]));
  return best;
}

double outPile(const GameState& s, const Card* pile, int n, const float* x) {
  double v = 0;
  for (int i = 0; i < n; i++) {
    const CardDef& d = cardDef(pile[i]);
    int sp = cardSpeed(pile[i], true);
    if (d.type == CT_POWER || d.type == CT_FAMILIAR) v += x[X_OUT_POWER] + std::max(0, sp);
    else if (d.type == CT_HUMAN) v += d.vp * x[X_OUT_HUMAN_VP] - ((d.kw & KW_SPICY) ? 4 : 0);
    if (sp < 0) v += sp * x[X_OUT_NEG_SPEED];
  }
  (void)s;
  return v;
}

}  // namespace

bool ExecParams::load(const std::string& path) {
#ifdef __wasi__
  (void)path;
  return loaded = false;
#else
  std::FILE* f = std::fopen(path.c_str(), "r");
  if (!f) return loaded = false;
  int k = 0;
  while (k < EXEC_PARAMS && std::fscanf(f, "%f", &x[k]) == 1) k++;
  std::fclose(f);
  return loaded = k == EXEC_PARAMS;
#endif
}

int execPick(const GameState& s, int seat, const Actions& legal, const ExecParams& params) {
  if (!s.hasCurrent) return 0;
  const float* x = params.x;
  const PlayerState& p = s.players[seat];
  const BoardData& b = boardOf(s);
  const int L = int(legal.size());
  const bool roseFree = !ownsRose(p) && !s.roses.empty();
  // Out while the turn allows and the chosen trip still fits the budget home
  // (the Labyrinth while a Rose is free and weighted; else the Forest if weighted).
  bool out = s.turn <= int(x[X_LAST_OUT]);
  if (out) {
    double pace = std::max(1.0, expectedHandSpeed(p) * x[X_PACE]);
    int moves = turnsAfter(s) + (parasolLeft(p) ? 1 : 0) + 1;
    if (roseFree && x[X_LAB] > 0.2)
      out = b.labyrinthDist[p.pos] + safeDistance(s, b.labyrinth) <= pace * moves;
    else if (x[X_FOREST] > 0.2)
      out = b.spaces[p.pos].region != R_FOREST && forestDist(s, p.pos) + 26 <= pace * moves;
  }

  switch (s.current.step) {
    case ST_MOVE: {
      Best best;
      int labHere = b.labyrinthDist[p.pos], forHere = forestDist(s, p.pos);
      for (int i = 0; i < L; i++) {
        const Action& a = legal[i];
        int d = a.type == A_MOVE || a.type == A_MIST ? a.space : a.type == A_STAY ? p.pos : -1;
        if (d < 0) continue;
        int spent = a.type == A_MOVE ? a.spent : 0;
        double v;
        if (out) {
          v = (roseFree ? x[X_LAB] * (labHere - int(b.labyrinthDist[d])) : 0) +
              x[X_FOREST] * (forHere - forestDist(s, d)) +
              (b.spaces[d].region == R_PLAINS ? x[X_PLAINS] : 0) - budgetRisk(s, p, d, x);
          for (int c = 0; c < b.nChests; c++)
            if (b.chests[c] == d && s.chests[c] >= 0) v += x[X_CHEST];
          for (int c = 0; c < b.nCrypts; c++)
            if (b.crypts[c] == d) v += x[X_CRYPT] * std::min<int>(3, s.crypts[c].size());
          if (b.spaces[d].effect == E_TAVERN && s.turn <= 5 && !s.tavern.empty() &&
              s.current.speedLeft - spent >= 2)
            v += x[X_TAVERN];
          if (d == b.labyrinth && roseFree) v += 3;
          v += 0.3 * bestHuntFrom(s, p, d, s.current.speedLeft - spent);
        } else {
          if (d == b.castle) {
            v = castleArrivalValue(s) + 1;
          } else {
            v = bestHuntFrom(s, p, d, s.current.speedLeft - spent) + spaceValue(s, p, d) -
                budgetRisk(s, p, d, x) + (b.spaces[d].region == R_FOREST ? x[X_BACK_FOREST] : 0);
          }
        }
        if (a.type == A_STAY) v -= 0.2;
        best.offer(i, v);
      }
      return best.idx >= 0 ? best.idx : 0;
    }
    case ST_ACT: {
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_ROSE) return i;
      if (!out) return heuristicPick(s, seat, legal);
      int useSpace = firstOf(legal, A_SPACE);
      if (useSpace >= 0) return useSpace;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_TAVERN && s.turn <= 5 && x[X_TAVERN] > 1) return i;
      Best best;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT) {
          const auto& pile = s.track[legal[i].row][legal[i].col];
          best.offer(i, outPile(s, pile.v, pile.n, x));
        }
      if (best.idx >= 0 && best.value > x[X_HUNT_MIN]) return best.idx;
      int end = firstOf(legal, A_END_TURN);
      return end >= 0 ? end : heuristicPick(s, seat, legal);
    }
    default: {
      int spite = spiteRule(s, seat, legal);
      return spite >= 0 ? spite : heuristicPick(s, seat, legal);
    }
  }
}

}  // namespace hg
