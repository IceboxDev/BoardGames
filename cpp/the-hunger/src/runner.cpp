// The Rose run — a scripted player built from the user's winning games vs two
// Draculas (staging replays 29, 32; prod 34). Two phases:
//   OUT  (no Rose yet, one left, the round trip fits): race to the Labyrinth at
//        full Speed through Chests (Parasol, +Speed, +Hunt tokens) and an early
//        Tavern; hunt only what speeds the deck (Powers, Familiars, positive-Speed
//        cards); take the Rose.
//   BACK Nosferatu's hunting — the Forest's +2 per Human does the rest — under a
//        real budget home: distance to the nearest safe space vs the deck's pace
//        over the turns left, a Parasol's extra turn included.
#include <algorithm>

#include "hg/ai.hpp"
#include "hg/nosferatu.hpp"

namespace hg {

using namespace nos;

namespace {

bool holdsParasol(const PlayerState& p) {
  if (p.parasolTurnUsed) return false;
  for (const BonusHolding& b : p.bonus)
    if (BONUS_DEFS[b.id].kind == BK_PARASOL) return true;
  return false;
}

double runPace(const PlayerState& p, const RunnerConfig& cfg) {
  return std::max(1.0, expectedHandSpeed(p) * cfg.pace / 100.0);
}

/** Turns still to move after this one (Parasol: one more). */
int movesLeft(const GameState& s, const PlayerState& p) {
  return turnsAfter(s) + (holdsParasol(p) ? 1 : 0);
}

/** Spaces from `sp` to the run's target (the Labyrinth, or the nearest Forest space). */
int targetDist(const GameState& s, int sp, const RunnerConfig& cfg) {
  const BoardData& b = boardOf(s);
  if (cfg.target == 0) return b.labyrinthDist[sp];
  const Graph& g = graphOf(s);
  int best = 99;
  for (int i = 0; i < b.n; i++)
    if (b.spaces[i].region == R_FOREST) best = std::min(best, int(g.dist[sp][i]));
  return best;
}

bool outbound(const GameState& s, const PlayerState& p, const RunnerConfig& cfg) {
  if (s.turn > cfg.lastOutTurn) return false;
  const BoardData& b = boardOf(s);
  if (cfg.target == 0) {
    if (ownsRose(p) || s.roses.empty()) return false;
    double need = double(b.labyrinthDist[p.pos]) + safeDistance(s, b.labyrinth);
    return need <= runPace(p, cfg) * (movesLeft(s, p) + 1);
  }
  if (b.spaces[p.pos].region == R_FOREST) return false;
  double need = double(targetDist(s, p.pos, cfg)) + 26;  // the Forest's edge is ~26 from safety
  return need <= runPace(p, cfg) * (movesLeft(s, p) + 1);
}

/** Sunrise risk of ending this turn on `d`, from the real budget home. */
double budgetRisk(const GameState& s, const PlayerState& p, int d, const RunnerConfig& cfg) {
  int left = movesLeft(s, p);
  int sd = safeDistance(s, d);
  if (left == 0) {
    if (sd > 0) return 200 + p.vp;
    return spaceOf(s, d).region == R_CEMETERY ? 5 : 0;
  }
  double reach = runPace(p, cfg) * left;
  double slack = reach - sd;
  return slack >= cfg.margin / 10.0 ? 0 : (cfg.margin / 10.0 - slack) * (5 + p.vp / 5.0);
}

bool chestAt(const GameState& s, int d) {
  const BoardData& b = boardOf(s);
  for (int i = 0; i < b.nChests; i++)
    if (b.chests[i] == d) return s.chests[i] >= 0;
  return false;
}

/** OUT: what a pile is worth to a racing deck. */
double racePile(const GameState& s, const Card* pile, int n) {
  double v = 0;
  for (int i = 0; i < n; i++) {
    const CardDef& d = cardDef(pile[i]);
    int sp = cardSpeed(pile[i], true);
    if (d.type == CT_POWER || d.type == CT_FAMILIAR) v += 1.5 + std::max(0, sp) * 1.5;
    else if (d.type == CT_HUMAN) v += d.vp * 0.4 + std::min(0, sp) * 2.5 - ((d.kw & KW_SPICY) ? 4 : 0);
    else v += std::max(0, sp);
  }
  (void)s;
  return v;
}

double backDestination(const GameState& s, const PlayerState& p, int d, int spent, const RunnerConfig& cfg) {
  const BoardData& b = boardOf(s);
  const Graph& g = graphOf(s);
  if (d == b.castle) return castleArrivalValue(s) + 1 - (movesLeft(s, p) > 2 ? 3 : 0);
  return bestHuntFrom(s, p, d, s.current.speedLeft - spent) + spaceValue(s, p, d) +
         (chestAt(s, d) ? 1 : 0) - budgetRisk(s, p, d, cfg) + (isWell(g, d) ? 0.5 : 0);
}

}  // namespace

int runnerPick(const GameState& s, int seat, const Actions& legal, const RunnerConfig& cfg) {
  if (!s.hasCurrent) return 0;
  const PlayerState& p = s.players[seat];
  const BoardData& b = boardOf(s);
  const int L = int(legal.size());
  const bool out = outbound(s, p, cfg);

  switch (s.current.step) {
    case ST_MOVE: {
      Best best;
      for (int i = 0; i < L; i++) {
        const Action& a = legal[i];
        int d = a.type == A_MOVE || a.type == A_MIST ? a.space : a.type == A_STAY ? p.pos : -1;
        if (d < 0) continue;
        int spent = a.type == A_MOVE ? a.spent : 0;
        double v;
        if (out) {
          v = 2.0 * (double(targetDist(s, p.pos, cfg)) - double(targetDist(s, d, cfg))) +
              (chestAt(s, d) ? cfg.chest / 10.0 : 0) +
              (b.spaces[d].effect == E_TAVERN && s.turn <= 5 && !s.tavern.empty() &&
                       s.current.speedLeft - spent >= 2
                   ? cfg.tavern / 10.0
                   : 0) +
              (d == b.labyrinth ? 6 : 0) - (a.type == A_STAY ? 1 : 0);
        } else {
          v = backDestination(s, p, d, spent, cfg) - (a.type == A_STAY ? 0.2 : 0);
        }
        best.offer(i, v);
      }
      return best.idx >= 0 ? best.idx : 0;
    }
    case ST_ACT: {
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_ROSE) return i;  // a free Rose is always taken
      if (!out) return heuristicPick(s, seat, legal);
      int instant = firstOf(legal, A_SPACE);
      if (instant >= 0) return instant;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_TAVERN && s.turn <= 5) return i;
      Best best;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT) {
          const auto& pile = s.track[legal[i].row][legal[i].col];
          best.offer(i, racePile(s, pile.v, pile.n));
        }
      if (best.idx >= 0 && best.value > 1) return best.idx;
      int end = firstOf(legal, A_END_TURN);
      return end >= 0 ? end : heuristicPick(s, seat, legal);
    }
    case ST_MANIPULATE: {
      // Spend +Speed tokens when the budget home is short (or outbound to the Rose).
      bool needSpeed = out || budgetRisk(s, p, p.pos, cfg) > 0;
      if (needSpeed)
        for (int i = 0; i < L; i++)
          if (legal[i].type == A_USE_BONUS && BONUS_DEFS[legal[i].token].kind == BK_SPEED) return i;
      return heuristicPick(s, seat, legal);
    }
    case ST_DIGEST: {
      Best best;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_DIGEST && legal[i].card >= 0 && cardDef(legal[i].card).type == CT_HUMAN)
          best.offer(i, -cardSpeed(legal[i].card, true) + 1);
      if (best.idx >= 0) return best.idx;
      return heuristicPick(s, seat, legal);
    }
    default: {
      int spite = spiteRule(s, seat, legal);
      return spite >= 0 ? spite : heuristicPick(s, seat, legal);
    }
  }
}

}  // namespace hg
