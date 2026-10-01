// Carmilla — a scripted expert. Nosferatu's move machinery plus the strategy a
// strong human plays (RULES.md, "The central tension"): head out while the deck
// is fast, take a Rose at the Labyrinth when the round trip is affordable,
// build the deck early (Familiars, Powers; Confuse as free Labyrinth-ward
// movement), digest to thin it, open the Tavern, and turn back on a budget
// computed from the deck's real Speed, the nearest safe space (the Cemetery
// counts) and a Parasol's extra turn.
//
// A bench / league / data opponent (not a lobby tier): it tests the claim that
// Dracula's blind spots are strategic, and keeps self-play honest.
#include <algorithm>

#include "hg/ai.hpp"
#include "hg/nosferatu.hpp"

namespace hg {

using namespace nos;

namespace {

bool hasParasol(const PlayerState& p) {
  if (p.parasolTurnUsed) return false;
  for (const BonusHolding& b : p.bonus)
    if (BONUS_DEFS[b.id].kind == BK_PARASOL) return true;
  return false;
}

/** Spaces a turn realistically covers: the deck's mean hand, minus a hunting allowance. */
double pace(const PlayerState& p, const CarmillaConfig& cfg) {
  return std::max(1.0, expectedHandSpeed(p) * cfg.pace / 100.0);
}

/** Turns still to play after this one (a Parasol adds one). */
int turnsLeft(const GameState& s, const PlayerState& p) {
  return turnsAfter(s) + (hasParasol(p) ? 1 : 0);
}

/** Is the Rose trip on: no Rose yet, one left, and there and back fits the budget? */
bool roseTrip(const GameState& s, const PlayerState& p, const CarmillaConfig& cfg) {
  if (!cfg.rose || ownsRose(p) || s.roses.empty()) return false;
  const BoardData& b = boardOf(s);
  double there = b.labyrinthDist[p.pos];
  double back = safeDistance(s, b.labyrinth);
  // This turn plus the turns after it, at the deck's pace.
  return there + back <= pace(p, cfg) * (turnsLeft(s, p) + 1);
}

/** Sunrise risk of ending this turn on `space`: how far past the budget home it is. */
double homeRisk(const GameState& s, const PlayerState& p, int space, const CarmillaConfig& cfg) {
  int left = turnsLeft(s, p);
  int sd = safeDistance(s, space);
  if (left == 0) return sd == 0 ? (spaceOf(s, space).region == R_CEMETERY ? 5 : 0) : 200 + p.vp;
  double reach = pace(p, cfg) * left;
  return sd <= reach ? 0 : (sd - reach) * (6 + p.vp / 5.0);
}

/** Carmilla's view of a card she would hunt. */
double cardAdjust(const GameState& s, int id, bool outbound, const CarmillaConfig& cfg) {
  const CardDef& d = cardDef(id);
  double v = 0;
  double early = std::max(0.0, 1.0 - double(s.turn - 1) / 7.0);  // 1 on turn 1, 0 from turn 8
  int speed = cardSpeed(id, true);
  if (d.type == CT_FAMILIAR || d.type == CT_POWER)
    v += early * cfg.deck / 10.0 * (1 + std::max(0, speed) + ((d.kw & KW_PERMANENT) ? 1 : 0));
  if (d.type == CT_HUMAN && (d.kw & KW_CONFUSE) && outbound) {
    // Nosferatu charges 1.5·t·3 for Confuse; outbound it is 4 free spaces.
    v += 1.5 * (double(s.turn) / double(TURNS)) * 3 + cfg.confuse / 10.0;
  }
  return v;
}

double carmillaPile(const GameState& s, const PlayerState& p, const Card* pile, int n, int space,
                    bool outbound, const CarmillaConfig& cfg) {
  double v = pileValue(s, p, pile, n, space);
  for (int i = 0; i < n; i++) v += cardAdjust(s, pile[i], outbound, cfg);
  return v;
}

double carmillaHuntFrom(const GameState& s, const PlayerState& p, int space, int speedLeft,
                        bool outbound, const CarmillaConfig& cfg) {
  const Space& sp = spaceOf(s, space);
  if (!s.hasCurrent || s.current.extraTurn || speedLeft <= 0) return 0;
  if (sp.effect == E_SHIP || hasKeyword(p, KW_HOLY_WATER)) return 0;
  double best = 0;
  for (int r = 0; r < s.nRows; r++)
    for (int c = 0; c < 3; c++) {
      const auto& pile = s.track[r][c];
      if (pile.empty() || huntCost(pile.v, pile.n, c) > speedLeft) continue;
      if (sp.region == R_CEMETERY) {
        bool human = false;
        for (Card id : pile) human |= cardDef(id).type == CT_HUMAN;
        if (human) continue;
      }
      best = jsMax(best, carmillaPile(s, p, pile.v, pile.n, space, outbound, cfg));
    }
  if (sp.effect == E_LABYRINTH && !ownsRose(p))
    for (Card rose : s.roses) best = jsMax(best, roseValue(s, rose) + cfg.roseBonus);
  if (sp.effect == E_TAVERN && speedLeft >= 2)
    best = jsMax(best, double(s.tavern.size()) * cfg.tavern / 10.0);
  return best;
}

double carmillaDestination(const GameState& s, const PlayerState& p, int to, int spent,
                           const CarmillaConfig& cfg) {
  const BoardData& b = boardOf(s);
  const Graph& g = graphOf(s);
  bool trip = roseTrip(s, p, cfg);
  if (to == b.castle) return castleArrivalValue(s) + 1;
  double v = carmillaHuntFrom(s, p, to, s.current.speedLeft - spent, trip, cfg) +
             spaceValue(s, p, to) - homeRisk(s, p, to, cfg) + (isWell(g, to) ? 0.5 : 0);
  if (trip) v += cfg.goal / 10.0 * (double(b.labyrinthDist[p.pos]) - double(b.labyrinthDist[to]));
  return v;
}

}  // namespace

int carmillaPick(const GameState& s, int seat, const Actions& legal, const CarmillaConfig& cfg) {
  if (!s.hasCurrent) return 0;
  const PlayerState& p = s.players[seat];
  const TurnState& turn = s.current;
  const int L = int(legal.size());
  bool trip = roseTrip(s, p, cfg);

  switch (turn.step) {
    case ST_MANIPULATE: {
      int nos = heuristicPick(s, seat, legal);
      // Outbound, Confuse is 4 free spaces toward the Labyrinth: keep it.
      const Action& a = legal[nos];
      bool dropsConfuse = (a.type == A_RESOLVE || a.type == A_USE_BONUS || a.type == A_FAMILIAR) &&
                          a.other >= 0 && hasKw(a.other, KW_CONFUSE);
      if (trip && dropsConfuse) {
        for (int i = 0; i < L; i++)
          if (legal[i].type == A_RESOLVE && legal[i].other < 0) return i;
        int end = firstOf(legal, A_END_MANIPULATION);
        if (end >= 0) return end;
      }
      return nos;
    }
    case ST_MOVE: {
      Best best;
      for (int i = 0; i < L; i++) {
        const Action& a = legal[i];
        if (a.type == A_MOVE) best.offer(i, carmillaDestination(s, p, a.space, a.spent, cfg));
        else if (a.type == A_MIST) best.offer(i, carmillaDestination(s, p, a.space, 0, cfg));
        else if (a.type == A_STAY) best.offer(i, carmillaDestination(s, p, p.pos, 0, cfg) - 0.2);
      }
      return best.idx >= 0 ? best.idx : 0;
    }
    case ST_ACT: {
      int instant = pickInstant(s, p, seat, legal);
      if (instant >= 0) return instant;
      int useSpace = firstOf(legal, A_SPACE);
      if (useSpace >= 0) return useSpace;
      Best best;
      for (int i = 0; i < L; i++) {
        const Action& a = legal[i];
        if (a.type == A_HUNT) {
          const auto& pile = s.track[a.row][a.col];
          best.offer(i, carmillaPile(s, p, pile.v, pile.n, p.pos, trip, cfg));
        } else if (a.type == A_HUNT_ROSE) {
          best.offer(i, roseValue(s, a.card) + cfg.roseBonus);
        } else if (a.type == A_HUNT_TAVERN) {
          best.offer(i, double(s.tavern.size()) * cfg.tavern / 10.0);
        }
      }
      // Extra hunts, Hypnosis and the rest: Nosferatu's rules, unless the best
      // hunt is clear (it plays hunts only when worth it).
      int nos = heuristicPick(s, seat, legal);
      const Action& na = legal[nos];
      if (na.type == A_FAMILIAR || na.type == A_USE_BONUS || na.type == A_HYPNOSIS) return nos;
      if (best.idx >= 0 && best.value > 0.5) return best.idx;
      int end = firstOf(legal, A_END_TURN);
      return end >= 0 ? end : nos;
    }
    case ST_DIGEST: {
      // Thin the deck: any Human that does not add Speed goes (it still scores).
      Best best;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_DIGEST && legal[i].card >= 0)
          best.offer(i, discardBadness(s, legal[i].card) + cfg.digest / 10.0 +
                            (cardDef(legal[i].card).type == CT_HUMAN ? 1 : 0));
      if (best.idx >= 0 && best.value > 0) return best.idx;
      return heuristicPick(s, seat, legal);
    }
    case ST_PUSH: {
      // Push rivals away from safety late, toward the Castle's far side early.
      Best best;
      bool late = s.turn >= TURNS - 4;
      for (int i = 0; i < L; i++) {
        if (legal[i].type != A_PUSH) continue;
        best.offer(i, legal[i].space < 0 ? 0 : late ? safeDistance(s, legal[i].space) : -1);
      }
      return best.idx >= 0 ? best.idx : heuristicPick(s, seat, legal);
    }
    default:
      return heuristicPick(s, seat, legal);
  }
}

}  // namespace hg
