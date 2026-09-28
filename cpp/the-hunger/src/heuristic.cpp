// Nosferatu (`heuristic-v1`) — a port of ai-heuristic.ts. Floating-point
// expressions keep the TS operation order (JS evaluates left to right, all in
// doubles), so every value — and therefore every pick — is bit-identical.
// Build with -ffp-contract=off (no FMA fusion).
#include <algorithm>
#include <cstring>

#include "hg/ai.hpp"

namespace hg {

namespace {

inline int turnsAfter(const GameState& s) { return std::max(0, TURNS - int(s.turn)); }

inline int regionBonus(const GameState& s, int space) {
  int r = spaceOf(s, space).region;
  return r == R_FOREST ? 2 : r == R_PLAINS ? 1 : 0;
}

double expectedHandSpeed(const PlayerState& p) {
  int count = 0, sum = 0;
  auto add = [&](int id) {
    if (hasKw(id, KW_PERMANENT)) return;
    count++;
    sum += cardSpeed(id, false);
  };
  for (Card c : p.deck) add(c);
  for (Card c : p.hand) add(c);
  for (const PlayCard& c : p.playArea) add(c.id);
  for (Card c : p.discard) add(c);
  for (Card c : p.digested) add(c);
  int permanent = 0;
  for (const PlayCard& c : p.playArea)
    if (hasKw(c.id, KW_PERMANENT)) permanent += cardSpeed(c.id, false);
  if (count == 0) return permanent;
  double mean = double(sum) / double(count);
  return double(permanent) + 3.0 * mean;
}

double missionAffinity(const PlayerState& p, int card) {
  const CardDef& def = cardDef(card);
  double bonus = 0;
  bool human = def.type == CT_HUMAN;
  for (uint8_t m : p.missions) {
    const MissionDef& c = MISSION_DEFS[m];
    if (c.std < 0) continue;
    if (c.std == SK_PER_CATEGORY && def.category == c.category) bonus += 0.8;
    if (c.std == SK_MAJORITY && (c.of == def.category || (c.of == OF_HUMANS && human)))
      bonus += 0.6;
    if (c.std == SK_MAJORITY && c.of == OF_FAMILIARS && def.type == CT_FAMILIAR) bonus += 0.8;
    if (c.std == SK_PER_DISTINCT && def.type == c.distinct) bonus += 0.6;
    if (c.std == SK_PER_HUMAN_WORTH && human && def.vp >= c.min &&
        def.vp <= (c.max >= 0 ? c.max : 99))
      bonus += c.vpEach;
    if (c.std == SK_NONE_WORTH && human && def.vp >= c.atLeast) bonus -= 3;
    if (c.std == SK_PER_KEYWORD && human && (def.kw & c.keywords)) bonus += c.vpEach * 0.8;
    if ((c.std == SK_COUNT_HUMANS || c.std == SK_SETS || c.std == SK_SAME_TYPE) && human)
      bonus += 0.3;
    if (c.std == SK_FEWEST_HUMANS && human) bonus -= 0.8;
  }
  return bonus;
}

double pileValue(const GameState& s, const PlayerState& p, const Card* pile, int n, int space) {
  int hunger = 0;
  for (const PlayCard& c : p.playArea) {
    const CardDef& d = cardDef(c.id);
    for (int k = 0; k < d.nPassives; k++)
      if (d.passives[k].kind == PK_HUNT_VP_PER_HUMAN) hunger += d.passives[k].n;
  }
  const double t = double(s.turn) / double(TURNS);
  const double drag = 0.4 + t * 1.4;
  const int region = spaceOf(s, space).region;
  double value = 0;
  for (int i = 0; i < n; i++) {
    int id = pile[i];
    const CardDef& def = cardDef(id);
    value += def.vp;
    int speed = cardSpeed(id, true);
    if (def.type == CT_HUMAN) {
      value += regionBonus(s, space) + hunger;
      if (def.huntBonusRegion >= 0 && region == def.huntBonusRegion) value += def.huntBonusVp;
      if (def.onHuntDigest) value += 1;
      if (def.kw & KW_CONFUSE) value -= 1.5 * t * 3;
      if (def.kw & KW_HOLY_WATER) value -= 1;
      if (def.kw & KW_SPICY) value -= 0.5;
      if (def.endGame.kind != EG_NONE) value += 1.5;
    } else {
      value += double(std::max(0, speed)) * (1.2 - t);
    }
    if (speed < 0) value += speed * drag;
    value += missionAffinity(p, id);
  }
  return value;
}

double roseValue(const GameState& s, int rose) {
  const CardDef& def = cardDef(rose);
  int left = turnsAfter(s);
  double ongoing = 0;
  for (int k = 0; k < def.nPassives; k++) {
    const Passive& e = def.passives[k];
    if (e.kind != PK_END_TURN_VP) continue;
    double share = e.when == W_ALWAYS ? 1 : 0.5;
    ongoing += e.n * share * left;
  }
  return def.vp + ongoing + cardSpeed(rose, false) * 0.8;
}

inline double jsMax(double a, double b) { return b > a ? b : a; }

double bestHuntFrom(const GameState& s, const PlayerState& p, int space, int speedLeft) {
  const Space& sp = spaceOf(s, space);
  if (!s.hasCurrent || s.current.extraTurn || speedLeft <= 0) return 0;
  // Nobody hunts in the Castle or on a Ship (RULINGS.huntInCastle = false).
  if (sp.effect == E_CASTLE || sp.effect == E_SHIP || hasKeyword(p, KW_HOLY_WATER)) return 0;
  double best = 0;
  for (int r = 0; r < s.nRows; r++) {
    for (int c = 0; c < 3; c++) {
      const auto& pile = s.track[r][c];
      if (pile.empty() || huntCost(pile.v, pile.n, c) > speedLeft) continue;
      if (sp.region == R_CEMETERY) {
        bool human = false;
        for (Card id : pile)
          if (cardDef(id).type == CT_HUMAN) human = true;
        if (human) continue;
      }
      best = jsMax(best, pileValue(s, p, pile.v, pile.n, space));
    }
  }
  if (sp.effect == E_LABYRINTH && !ownsRose(p))
    for (Card rose : s.roses) best = jsMax(best, roseValue(s, rose));
  if (sp.effect == E_TAVERN && speedLeft >= 2) best = jsMax(best, double(s.tavern.size() * 2));
  return best;
}

double spaceValue(const GameState& s, const PlayerState& p, int space) {
  const BoardData& b = boardOf(s);
  switch (b.spaces[space].effect) {
    case E_CHEST:
    case E_CHEST_OPEN:
      for (int i = 0; i < b.nChests; i++)
        if (b.chests[i] == space) return s.chests[i] >= 0 ? 3 : 0;
      return 0;
    case E_CRYPT:
      for (int i = 0; i < b.nCrypts; i++)
        if (b.crypts[i] == space) return s.crypts[i].empty() ? 0 : 2;
      return 0;
    case E_MARKET:
    case E_CHURCH:
    case E_MANSION:
    case E_BARRACKS:
      for (Card c : p.discard)
        if (cardDef(c).type == CT_HUMAN) return 1.5;
      return 0;
    default: return 0;
  }
}

double risk(const GameState& s, const PlayerState& p, int space) {
  const BoardData& b = boardOf(s);
  int left = turnsAfter(s);
  int dist = b.castleDist[space];
  const Space& sp = b.spaces[space];
  if (left == 0) {
    if (sp.region == R_CASTLE) return 0;
    if (sp.region == R_CEMETERY) return 5;
    if (sp.region == R_MOUNTAINS && s.mode == MODE_ROOKIE)
      return sp.mountainPenalty >= 0 ? sp.mountainPenalty : 0;
    if (sp.region == R_MOUNTAINS && s.beginnerSafeMountains) return 0;
    return 200 + p.vp;
  }
  double pace = jsMax(1, expectedHandSpeed(p) * 0.7);
  double reach = left * pace;
  if (dist <= reach - pace) return 0;
  return (dist - (reach - pace)) * (4 + p.vp / 6.0);
}

double castleArrivalValue(const GameState& s) {
  int tile = s.castleTiles.empty() ? 0 : s.castleTiles[0];
  int left = turnsAfter(s);
  return tile - left * 3.5;
}

double destinationValue(const GameState& s, const PlayerState& p, int to, int spent) {
  if (!s.hasCurrent) return 0;
  const Graph& g = graphOf(s);
  if (to == g.b->castle) return castleArrivalValue(s) + 1;
  return bestHuntFrom(s, p, to, s.current.speedLeft - spent) + spaceValue(s, p, to) -
         risk(s, p, to) + (isWell(g, to) ? 0.5 : 0);
}

double discardBadness(const GameState& s, int id) {
  const CardDef& def = cardDef(id);
  double bad = 0;
  if (def.kw & KW_CONFUSE) bad += 4 + (double(s.turn) / double(TURNS)) * 4;
  if (def.kw & KW_HOLY_WATER) bad += 3;
  if (def.kw & KW_SPICY) bad += 2;
  int speed = cardSpeed(id, true);
  if (speed < 0) bad += -speed * 1.5;
  if ((def.kw & KW_PERMANENT) && !(def.kw & KW_SPICY)) bad -= 5;
  if (speed > 0) bad -= speed * 2;
  if (def.type == CT_HUMAN) bad += 0.5;
  return bad;
}

struct CtxCache {
  bool ready = false;
  Tally tallies[MAX_PLAYERS];
  int pre[MAX_PLAYERS];
  MissionContext ctx;
};

double missionEstimate(const GameState& s, const PlayerState& p, int seat, int id, CtxCache& cache) {
  const MissionDef& def = MISSION_DEFS[id];
  if (def.instant != IK_NONE) return def.instant == IK_DIGEST_HAND ? 1.5 : 3;
  if (def.std < 0) return 0;
  if (!cache.ready) {
    missionContext(s, seat, cache.tallies, cache.pre, cache.ctx);
    cache.ready = true;
  }
  int now = def.std == SK_MISSIONARY ? p.missions.size() : missionScore(def, cache.ctx);
  double left = double(turnsAfter(s)) / double(TURNS);
  double hope;
  switch (def.std) {
    case SK_PER_CATEGORY: hope = 3; break;
    case SK_PER_HUMAN_WORTH: hope = 3; break;
    case SK_COUNT_HUMANS: hope = def.vp * 0.5; break;
    case SK_MAJORITY: hope = def.vp * 0.35; break;
    case SK_SAME_TYPE: hope = def.vp * 0.5; break;
    case SK_SETS: hope = 4; break;
    case SK_HAS_ROSE: hope = def.vp * 0.5; break;
    case SK_HOST: hope = 3; break;
    case SK_FIRST_HOME: hope = def.vp * 0.25; break;
    case SK_SCORE_RANK: hope = def.vp * 0.2; break;
    case SK_NONE_WORTH: hope = def.vp * 0.8; break;
    default: hope = 2; break;
  }
  return now + hope * left;
}

int pickInstant(const GameState& s, const PlayerState& p, int seat, const Actions& legal) {
  int here = p.pos;
  int best = -1;
  double bestV = 0;
  for (int i = 0; i < int(legal.size()); i++) {
    const Action& a = legal[i];
    if (a.type != A_INSTANT) continue;
    const MissionDef& m = MISSION_DEFS[a.mission];
    if (m.instant == IK_NONE) continue;
    double v = 0;
    switch (m.instant) {
      case IK_DIGEST_HAND: {
        int humans = 0;
        for (const PlayCard& c : p.playArea)
          if (!c.carried && cardDef(c.id).type == CT_HUMAN) humans++;
        bool slow = playAreaSpeed(p) <= 1;
        v = humans >= 2 && slow && turnsAfter(s) > 2 ? humans : 0;
        break;
      }
      case IK_FREE_HUNT_AFTER_COL3:
      case IK_FREE_HUNT_SAME_COLUMN:
        if (a.row >= 0 && a.col >= 0) {
          const auto& pile = s.track[a.row][a.col];
          v = pileValue(s, p, pile.v, pile.n, here);
        }
        break;
      case IK_TAKE_BONUS: v = 2.5; break;
      case IK_FREE_FAMILIAR: v = a.card >= 0 ? 2 + cardSpeed(a.card, false) : 0; break;
      case IK_VP_PER_CLOSER: {
        int n = closerCount(s, seat);
        v = n >= 3 || turnsAfter(s) == 0 ? n : 0;
        break;
      }
    }
    if (v > 0.5 && (best < 0 || v > bestV)) {
      best = i;
      bestV = v;
    }
  }
  return best;
}

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

int firstOf(const Actions& legal, int8_t type) {
  for (int i = 0; i < int(legal.size()); i++)
    if (legal[i].type == type) return i;
  return -1;
}

using Track = Vec<Card, CAP_PILE>[MAX_ROWS][3];

double bestOn(const GameState& s, const PlayerState& p, const Track& track, int here) {
  double v = 0;
  int speedLeft = s.current.speedLeft;
  for (int r = 0; r < s.nRows; r++)
    for (int c = 0; c < 3; c++) {
      const auto& pile = track[r][c];
      if (!pile.empty() && huntCost(pile.v, pile.n, c) <= speedLeft)
        v = jsMax(v, pileValue(s, p, pile.v, pile.n, here));
    }
  return v;
}

}  // namespace

int heuristicPick(const GameState& s, int seat, const Actions& legal) {
  const PlayerState& p = s.players[seat];
  if (!s.hasCurrent) return 0;
  const TurnState& turn = s.current;
  const Graph& g = graphOf(s);
  const BoardData& b = *g.b;
  const int L = int(legal.size());

  switch (turn.step) {
    case ST_MANIPULATE: {
      int instant = pickInstant(s, p, seat, legal);
      if (instant >= 0) return instant;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_FAMILIAR && cardDef(legal[i].card).act.kind == AK_REDRAW_HAND) {
          if (playAreaSpeed(p) <= 2) return i;
          break;
        }
      Best wiggle;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_FAMILIAR && legal[i].other >= 0)
          wiggle.offer(i, discardBadness(s, legal[i].other));
      if (wiggle.idx >= 0 && wiggle.value > 1.5) return wiggle.idx;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_RESOLVE && legal[i].other < 0) return i;
      Best discard;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_RESOLVE && legal[i].other >= 0)
          discard.offer(i, discardBadness(s, legal[i].other));
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_USE_BONUS && legal[i].other >= 0)
          discard.offer(i, discardBadness(s, legal[i].other));
      if (discard.idx >= 0 && discard.value > 1) return discard.idx;
      for (int i = 0; i < L; i++) {
        if (legal[i].type != A_USE_BONUS) continue;
        int kind = BONUS_DEFS[legal[i].token].kind;
        if (kind == BK_DRAW_TO_PLAY || kind == BK_MISSION) return i;
        if (kind == BK_SPEED) {
          int dist = b.castleDist[p.pos];
          if (turnsAfter(s) <= 2 && dist > 0) return i;
        }
      }
      int end = firstOf(legal, A_END_MANIPULATION);
      return end >= 0 ? end : 0;
    }
    case ST_MOVE: {
      Best best;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_MOVE)
          best.offer(i, destinationValue(s, p, legal[i].space, legal[i].spent));
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_MIST) best.offer(i, destinationValue(s, p, legal[i].space, 0));
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_STAY) best.offer(i, destinationValue(s, p, p.pos, 0) - 0.2);
      return best.idx >= 0 ? best.idx : 0;
    }
    case ST_PUSH: {
      bool nanny = passiveCount(p, PK_PUSH_TAX) > 0;
      Best best;
      for (int i = 0; i < L; i++) {
        if (legal[i].type != A_PUSH) continue;
        double v;
        if (legal[i].space < 0)
          v = 0;
        else {
          bool late = s.turn >= TURNS - 4;
          int from = b.castleDist[p.pos];
          int to = b.castleDist[legal[i].space];
          v = (nanny ? 2 : 0) + (late ? to - from - 0.5 : -1);
        }
        best.offer(i, v);
      }
      return best.idx >= 0 ? best.idx : 0;
    }
    case ST_ACT: {
      int instant = pickInstant(s, p, seat, legal);
      if (instant >= 0) return instant;
      int useSpace = firstOf(legal, A_SPACE);
      if (useSpace >= 0) return useSpace;
      int here = p.pos;
      // hunts = [hunt..., hunt-rose..., hunt-tavern...]
      Best best;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT) {
          const auto& pile = s.track[legal[i].row][legal[i].col];
          best.offer(i, pileValue(s, p, pile.v, pile.n, here));
        }
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_ROSE) best.offer(i, roseValue(s, legal[i].card));
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_HUNT_TAVERN) best.offer(i, double(s.tavern.size() * 2));

      bool anyHypnosis = firstOf(legal, A_HYPNOSIS) >= 0;
      if (anyHypnosis && turn.hunts == 0 && turn.speedLeft > 0) {
        double now = bestOn(s, p, s.track, here);
        Best moved;
        static thread_local Track track;
        for (int i = 0; i < L; i++) {
          if (legal[i].type != A_HYPNOSIS) continue;
          Card pick = Card(legal[i].other);
          for (int r = 0; r < s.nRows; r++)
            for (int c = 0; c < 3; c++) {
              track[r][c] = s.track[r][c];
              track[r][c].removeAll(pick);
            }
          track[legal[i].row][legal[i].col].push(pick);
          moved.offer(i, bestOn(s, p, track, here) - now);
        }
        if (moved.idx >= 0 && moved.value > 1) return moved.idx;
      }

      int kutya = -1, token = -1;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_FAMILIAR &&
            cardDef(legal[i].card).act.kind == AK_DISCARD_FOR_COL1_HUNT) {
          kutya = i;
          break;
        }
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_USE_BONUS && BONUS_DEFS[legal[i].token].kind == BK_EXTRA_HUNT) {
          token = i;
          break;
        }
      if ((kutya >= 0 || token >= 0) && best.idx >= 0 && best.value > 0.5 && turn.hunts == 0) {
        const Action& chosen = legal[best.idx];
        int firstCost = 0;
        if (chosen.type == A_HUNT) {
          const auto& pile = s.track[chosen.row][chosen.col];
          firstCost = huntCost(pile.v, pile.n, chosen.col);
        }
        auto secondBest = [&](int cols) {
          Best sb;
          int k = 0;
          for (int r = 0; r < s.nRows; r++)
            for (int c = 0; c < 3; c++) {
              if (!((cols >> c) & 1)) continue;
              const auto& pile = s.track[r][c];
              if (pile.empty()) continue;
              if (chosen.type == A_HUNT && chosen.row == r && chosen.col == c) continue;
              double v = firstCost + huntCost(pile.v, pile.n, c) <= turn.speedLeft
                             ? pileValue(s, p, pile.v, pile.n, here)
                             : 0;
              sb.offer(k++, v);
            }
          return sb;
        };
        if (token >= 0) {
          Best anyCol = secondBest(0b111);
          if (anyCol.idx >= 0 && anyCol.value > 2.5) return token;
        }
        if (kutya >= 0) {
          Best col1 = secondBest(0b001);
          if (col1.idx >= 0 && col1.value > 2.5) return kutya;
        }
      }
      if (best.idx >= 0 && best.value > 0.5) return best.idx;
      int end = firstOf(legal, A_END_TURN);
      return end >= 0 ? end : 0;
    }
    case ST_NANNY: {
      Best worst;
      for (int i = 0; i < L; i++) {
        if (legal[i].type != A_DISCARD_PERMANENT) continue;
        const CardDef& d = cardDef(legal[i].card);
        int keep = d.family == FAM_ROSE ? 10 : cardSpeed(legal[i].card, true) + d.nPassives;
        worst.offer(i, -double(keep));
      }
      return worst.idx >= 0 ? worst.idx : 0;
    }
    case ST_DIGEST: {
      Best best;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_DIGEST && legal[i].card >= 0)
          best.offer(i, discardBadness(s, legal[i].card) + (turn.digestCategory >= 0 ? 1 : 0));
      if (best.idx >= 0 && best.value > 0) return best.idx;
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_DIGEST && legal[i].card < 0) return i;
      return 0;
    }
    case ST_MISSIONS: {
      CtxCache cache;
      Best best;
      for (int i = 0; i < L; i++) {
        if (legal[i].type != A_KEEP_MISSIONS) continue;
        double sum = 0;
        for (int m = 0; m < NUM_MISSIONS; m++)
          if ((legal[i].keep >> m) & 1) sum = sum + missionEstimate(s, p, seat, m, cache);
        best.offer(i, sum);
      }
      return best.idx >= 0 ? best.idx : 0;
    }
    case ST_INSPIRE: {
      Best best;
      for (int i = 0; i < L; i++) {
        if (legal[i].type != A_INSPIRE) continue;
        int len = 0;
        for (int k = 0; k < b.nCrypts; k++)
          if (b.crypts[k] == legal[i].space) len = s.crypts[k].size();
        best.offer(i, len);
      }
      return best.idx >= 0 ? best.idx : 0;
    }
    case ST_READY: {
      int a = firstOf(legal, A_READY);
      if (a < 0) return 0;
      int card = legal[a].card;
      bool good = cardSpeed(card, true) > 0 || hasKw(card, KW_PERMANENT);
      for (int i = 0; i < L; i++)
        if (legal[i].type == A_READY && legal[i].spent == (good ? 0 : 1)) return i;
      return a;
    }
  }
  return 0;
}

}  // namespace hg
