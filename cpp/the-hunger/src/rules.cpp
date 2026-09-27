// Read-only queries and the legal-action enumeration — a port of rules.ts.
// Legal actions are produced in EXACTLY getLegalActions' order.
#include <algorithm>
#include <cstring>
#include <string>

#include "hg/engine.hpp"

namespace hg {

int deciderOf(const TurnState& t) {
  if (t.step == ST_NANNY) return t.nannyQueue.empty() ? t.player : t.nannyQueue[0];
  return t.player;
}

int activePlayer(const GameState& s) {
  if (s.phase == PH_OVER || !s.hasCurrent) return -1;
  return deciderOf(s.current);
}

bool hasHuman(const PlayerState& p) {
  for (const PlayCard& c : p.playArea)
    if (cardDef(c.id).type == CT_HUMAN) return true;
  return false;
}

bool hasKeyword(const PlayerState& p, uint16_t kw) {
  for (const PlayCard& c : p.playArea)
    if (cardDef(c.id).kw & kw) return true;
  return false;
}


int passiveCount(const PlayerState& p, int kind) {
  int n = 0;
  for (const PlayCard& c : p.playArea) {
    const CardDef& d = cardDef(c.id);
    for (int i = 0; i < d.nPassives; i++)
      if (d.passives[i].kind == kind) n++;
  }
  return n;
}

int playAreaSpeed(const PlayCard* cards, int n) {
  bool human = false;
  for (int i = 0; i < n; i++)
    if (cardDef(cards[i].id).type == CT_HUMAN) human = true;
  int speed = 0;
  for (int i = 0; i < n; i++) speed += cardSpeed(cards[i].id, human);
  int humans = 0;
  for (int i = 0; i < n; i++)
    if (cardDef(cards[i].id).type == CT_HUMAN) humans++;
  for (int i = 0; i < n; i++) {
    const CardDef& d = cardDef(cards[i].id);
    for (int k = 0; k < d.nPassives; k++) {
      const Passive& e = d.passives[k];
      if (e.kind == PK_SPEED_PER_HUMAN_WORTH) {
        int cnt = 0;
        for (int j = 0; j < n; j++) {
          const CardDef& h = cardDef(cards[j].id);
          if (h.type == CT_HUMAN && h.vp >= e.min && h.vp <= e.max) cnt++;
        }
        speed += e.n * cnt;
      }
    }
  }
  for (int i = 0; i < n; i++) {
    const CardDef& d = cardDef(cards[i].id);
    for (int k = 0; k < d.nPassives; k++) {
      const Passive& e = d.passives[k];
      if (e.kind == PK_HUMANS_BONUS && humans >= e.atLeast) speed += e.speed;
    }
  }
  return speed;
}

int humansBonusVp(const PlayerState& p) {
  int humans = 0;
  for (const PlayCard& c : p.playArea)
    if (cardDef(c.id).type == CT_HUMAN) humans++;
  int vp = 0;
  for (const PlayCard& c : p.playArea) {
    const CardDef& d = cardDef(c.id);
    for (int k = 0; k < d.nPassives; k++) {
      const Passive& e = d.passives[k];
      if (e.kind == PK_HUMANS_BONUS && humans >= e.atLeast) vp += e.vp;
    }
  }
  return vp;
}

bool ownsRose(const PlayerState& p) {
  auto rose = [](int id) { return cardDef(id).family == FAM_ROSE; };
  for (Card c : p.deck)
    if (rose(c)) return true;
  for (Card c : p.hand)
    if (rose(c)) return true;
  for (const PlayCard& c : p.playArea)
    if (rose(c.id)) return true;
  for (Card c : p.discard)
    if (rose(c)) return true;
  for (Card c : p.digested)
    if (rose(c)) return true;
  return false;
}

int huntCost(const Card* pile, int n, int col) {
  bool fast = false;
  for (int i = 0; i < n; i++)
    if (hasKw(pile[i], KW_FAST)) fast = true;
  return col + 1 + (fast ? 1 : 0);
}

int digestCategoryOf(int effect) {
  switch (effect) {
    case E_MARKET: return CAT_VILLAGER;
    case E_CHURCH: return CAT_RELIGIOUS;
    case E_MANSION: return CAT_NOBLE;
    case E_BARRACKS: return CAT_MILITARY;
    default: return -1;
  }
}

HuntsLeft huntsLeft(const TurnState& t) {
  int generalUsed = t.hunts - t.col1Used;
  return {std::max(0, 1 + t.extraHunts - generalUsed), std::max(0, t.col1Hunts - t.col1Used)};
}

bool huntBlocked(const GameState& s, const PlayerState& p, const TurnState& t) {
  if (t.extraTurn) return true;
  if (t.speed <= 0) return true;
  if (hasKeyword(p, KW_HOLY_WATER)) return true;
  int effect = spaceOf(s, p.pos).effect;
  // The Castle is a Well (RULINGS.castleIsWell): hunting there is allowed.
  return effect == E_SHIP;
}

int closerCount(const GameState& s, int seat) {
  const BoardData& b = boardOf(s);
  int mine = b.castleDist[s.players[seat].pos];
  int n = 0;
  for (int i = 0; i < s.nPlayers; i++)
    if (i != seat && b.castleDist[s.players[i].pos] < mine) n++;
  return n;
}

static int drawCount(const Manipulation& m, bool human) {
  return human ? (m.withHuman >= 0 ? m.withHuman : m.n) : m.n;
}

// ---------------------------------------------------------------------------

static Action act(int8_t type) {
  Action a;
  a.type = type;
  return a;
}

static void familiarActions(const PlayerState& p, const TurnState& t, Actions& out) {
  for (const PlayCard& card : p.playArea) {
    const CardDef& d = cardDef(card.id);
    switch (d.act.kind) {
      case AK_DISCARD_FOR_COL1_HUNT:
        if (t.step == ST_ACT && !t.extraTurn) {
          Action a = act(A_FAMILIAR);
          a.card = card.id;
          out.push_back(a);
        }
        break;
      case AK_DIGEST_WITH_CARD:
        if (t.step != ST_MANIPULATE && t.step != ST_ACT) break;
        for (const PlayCard& target : p.playArea) {
          if (target.id != card.id) {
            Action a = act(A_FAMILIAR);
            a.card = card.id;
            a.other = target.id;
            out.push_back(a);
          }
        }
        break;
      case AK_REDRAW_HAND:
        if (t.step == ST_MANIPULATE && !t.touched) {
          Action a = act(A_FAMILIAR);
          a.card = card.id;
          out.push_back(a);
        }
        break;
      default: break;
    }
  }
}

static void hypnosisActions(const GameState& s, const PlayerState& p, const TurnState& t,
                            Actions& out) {
  if (t.step != ST_MANIPULATE && t.step != ST_ACT) return;
  int rows = s.nRows;
  for (const PlayCard& card : p.playArea) {
    if (card.resolved || cardDef(card.id).act.kind != AK_HYPNOSIS) continue;
    for (int r = 0; r < rows; r++) {
      for (int c = 0; c < 3; c++) {
        int to[4][2] = {{r - 1, c}, {r + 1, c}, {r, c - 1}, {r, c + 1}};
        const auto& pile = s.track[r][c];
        for (Card pick : pile) {
          for (auto& d : to) {
            if (d[0] < 0 || d[0] >= rows || d[1] < 0 || d[1] >= 3) continue;
            Action a = act(A_HYPNOSIS);
            a.card = card.id;
            a.other = pick;
            a.row = int8_t(d[0]);
            a.col = int8_t(d[1]);
            out.push_back(a);
          }
        }
      }
    }
  }
}

static bool anyMandatoryDraw(const PlayerState& p) {
  bool human = hasHuman(p);
  for (const PlayCard& c : p.playArea) {
    const Manipulation& m = cardDef(c.id).manip;
    if (!c.resolved && m.kind == MK_DRAW && m.mandatory && drawCount(m, human) > 0) return true;
  }
  return false;
}

static void manipulationActions(const PlayerState& p, Actions& out) {
  bool human = hasHuman(p);
  for (const PlayCard& card : p.playArea) {
    const Manipulation& m = cardDef(card.id).manip;
    if (m.kind == MK_NONE) continue;
    if (m.kind == MK_DRAW) {
      if (!card.resolved && drawCount(m, human) > 0) {
        Action a = act(A_RESOLVE);
        a.card = card.id;
        out.push_back(a);
      }
    } else {
      if (card.used >= m.times) continue;
      for (const PlayCard& target : p.playArea) {
        if (target.id == card.id || target.resolved) continue;
        Action a = act(A_RESOLVE);
        a.card = card.id;
        a.other = target.id;
        out.push_back(a);
      }
    }
  }
  for (const BonusHolding& token : p.bonus) {
    if (token.used) continue;
    int k = BONUS_DEFS[token.id].kind;
    if (k == BK_DISCARD_DRAW) {
      for (const PlayCard& target : p.playArea) {
        if (!target.resolved) {
          Action a = act(A_USE_BONUS);
          a.token = token.id;
          a.other = target.id;
          out.push_back(a);
        }
      }
    } else if (k == BK_DRAW_TO_PLAY || k == BK_SPEED || k == BK_MISSION) {
      Action a = act(A_USE_BONUS);
      a.token = token.id;
      out.push_back(a);
    }
  }
}

static void instantActions(const GameState& s, const PlayerState& p, const TurnState& t,
                           Actions& out) {
  const BoardData& b = boardOf(s);
  const Space& here = b.spaces[p.pos];
  auto piles = [&](int mission, int colMask) {
    for (int r = 0; r < s.nRows; r++) {
      for (int c = 0; c < 3; c++) {
        const auto& pile = s.track[r][c];
        if (pile.empty() || (colMask && !((colMask >> c) & 1))) continue;
        if (here.region == R_CEMETERY) {
          bool human = false;
          for (Card id : pile)
            if (cardDef(id).type == CT_HUMAN) human = true;
          if (human) continue;
        }
        Action a = act(A_INSTANT);
        a.mission = int16_t(mission);
        a.row = int8_t(r);
        a.col = int8_t(c);
        out.push_back(a);
      }
    }
  };
  bool canHunt = !huntBlocked(s, p, t);
  for (uint8_t mission : p.missions) {
    const MissionDef& m = MISSION_DEFS[mission];
    if (m.instant == IK_NONE) continue;
    bool anytime = t.step == ST_MANIPULATE || t.step == ST_ACT;
    switch (m.instant) {
      case IK_DIGEST_HAND:
        if (t.step == ST_MANIPULATE && !t.touched) {
          Action a = act(A_INSTANT);
          a.mission = mission;
          out.push_back(a);
        }
        break;
      case IK_FREE_HUNT_AFTER_COL3: {
        bool col3 = false;
        for (const TrackHunt& h : t.trackHunts)
          if (h.col == 2) col3 = true;
        if (t.step == ST_ACT && canHunt && col3) piles(mission, 0);
        break;
      }
      case IK_FREE_HUNT_SAME_COLUMN: {
        if (t.step != ST_ACT || !canHunt) break;
        int cols = 0;
        for (const TrackHunt& h : t.trackHunts)
          if (h.human && h.region == m.instRegion) cols |= 1 << h.col;
        if (cols) piles(mission, cols);
        break;
      }
      case IK_TAKE_BONUS: {
        if (!anytime) break;
        // Object.entries(chests).sort(): each [key, value] compares as "key,value".
        struct E {
          std::string key;
          int slot;
        };
        E es[MAX_CHESTS];
        int ne = 0;
        for (int i = 0; i < b.nChests; i++) {
          int tok = s.chests[i];
          es[ne].key = std::string(b.spaces[b.chests[i]].id) + "," +
                       (tok >= 0 ? BONUS_DEFS[tok].id : "");
          es[ne].slot = i;
          ne++;
        }
        std::stable_sort(es, es + ne, [](const E& x, const E& y) { return x.key < y.key; });
        for (int i = 0; i < ne; i++) {
          if (s.chests[es[i].slot] >= 0) {
            Action a = act(A_INSTANT);
            a.mission = mission;
            a.space = b.chests[es[i].slot];
            out.push_back(a);
          }
        }
        break;
      }
      case IK_FREE_FAMILIAR:
        if (!anytime || t.extraTurn || hasKeyword(p, KW_HOLY_WATER)) break;
        for (int r = 0; r < s.nRows; r++)
          for (int c = 0; c < 3; c++)
            for (Card card : s.track[r][c])
              if (cardDef(card).type == CT_FAMILIAR) {
                Action a = act(A_INSTANT);
                a.mission = mission;
                a.card = card;
                out.push_back(a);
              }
        break;
      case IK_VP_PER_CLOSER:
        if (anytime && closerCount(s, int(&p - s.players)) > 0) {
          Action a = act(A_INSTANT);
          a.mission = mission;
          out.push_back(a);
        }
        break;
    }
  }
}

static void moveActions(const GameState& s, const PlayerState& p, const TurnState& t,
                        Actions& out) {
  const Graph& g = graphOf(s);
  if (t.speed <= 0 || isReturned(p)) return;
  Dest dests[MAX_SPACES];
  if (hasKeyword(p, KW_SPICY)) {
    int n = spicyDestinations(g, p.pos, t.speed, dests);
    if (n > 0) {
      for (int i = 0; i < n; i++) {
        Action a = act(A_MOVE);
        a.space = dests[i].to;
        a.spent = dests[i].spent;
        out.push_back(a);
      }
    } else {
      out.push_back(act(A_STAY));
    }
    return;
  }
  uint64_t occupied = 0;
  int self = int(&p - s.players);
  for (int i = 0; i < s.nPlayers; i++)
    if (i != self) occupied |= uint64_t(1) << s.players[i].pos;
  bool bat = passiveCount(p, PK_BAT) > 0;
  out.push_back(act(A_STAY));
  int n = walkDestinations(g, p.pos, t.speed, bat, occupied, dests);
  for (int i = 0; i < n; i++) {
    Action a = act(A_MOVE);
    a.space = dests[i].to;
    a.spent = dests[i].spent;
    out.push_back(a);
  }
  if (passiveCount(p, PK_MIST) > 0) {
    int16_t mist[MAX_SPACES];
    int m = mistDestinations(g, p.pos, mist);
    for (int i = 0; i < m; i++) {
      Action a = act(A_MIST);
      a.space = mist[i];
      out.push_back(a);
    }
  }
}

static int digestibleCount(const PlayerState& p, int category) {
  int n = 0;
  auto ok = [&](int id) {
    const CardDef& d = cardDef(id);
    return d.type == CT_HUMAN && d.category == category;
  };
  for (const PlayCard& c : p.playArea)
    if (ok(c.id)) n++;
  for (Card c : p.discard)
    if (ok(c)) n++;
  return n;
}

static void actActions(const GameState& s, const PlayerState& p, const TurnState& t,
                       Actions& out) {
  const BoardData& b = boardOf(s);
  const Space& here = b.spaces[p.pos];
  bool blocked = huntBlocked(s, p, t);
  HuntsLeft left = huntsLeft(t);

  if (!t.spaceUsed && t.speed > 0) {
    bool chestFull = false;
    if (here.effect == E_CHEST || here.effect == E_CHEST_OPEN) {
      for (int i = 0; i < b.nChests; i++)
        if (b.chests[i] == p.pos && s.chests[i] >= 0) chestFull = true;
    }
    if (chestFull) {
      out.push_back(act(A_SPACE));
    } else if (here.effect == E_CRYPT) {
      for (int i = 0; i < b.nCrypts; i++)
        if (b.crypts[i] == p.pos && !s.crypts[i].empty()) out.push_back(act(A_SPACE));
    } else {
      int category = digestCategoryOf(here.effect);
      if (category >= 0 && digestibleCount(p, category) > 0) out.push_back(act(A_SPACE));
    }
  }

  if (!blocked && t.speedLeft > 0) {
    bool noHumans = here.region == R_CEMETERY;
    bool anyHunt = left.general > 0;
    for (int r = 0; r < s.nRows; r++) {
      for (int c = 0; c < 3; c++) {
        const auto& pile = s.track[r][c];
        if (pile.empty()) continue;
        if (!(anyHunt || (c == 0 && left.col1 > 0))) continue;
        if (huntCost(pile.v, pile.n, c) > t.speedLeft) continue;
        if (noHumans) {
          bool human = false;
          for (Card id : pile)
            if (cardDef(id).type == CT_HUMAN) human = true;
          if (human) continue;
        }
        Action a = act(A_HUNT);
        a.row = int8_t(r);
        a.col = int8_t(c);
        out.push_back(a);
      }
    }
    if (here.effect == E_TAVERN && !t.spaceUsed && anyHunt && !s.tavern.empty() &&
        t.speedLeft >= 2)
      out.push_back(act(A_HUNT_TAVERN));
  }
  if (here.effect == E_LABYRINTH && !blocked && !t.spaceUsed && left.general > 0 && !ownsRose(p)) {
    for (Card card : s.roses) {
      Action a = act(A_HUNT_ROSE);
      a.card = card;
      out.push_back(a);
    }
  }
  instantActions(s, p, t, out);
  if (!t.extraTurn) {
    for (const BonusHolding& token : p.bonus) {
      if (!token.used && BONUS_DEFS[token.id].kind == BK_EXTRA_HUNT) {
        Action a = act(A_USE_BONUS);
        a.token = token.id;
        out.push_back(a);
      }
    }
  }
  out.push_back(act(A_END_TURN));
}

static void keepSets(const GameState& s, const PlayerState& p, const TurnState& t, Actions& out) {
  if (!t.hasPick) return;
  if (t.pickSource < 0 || s.mode == MODE_ROOKIE) {
    for (uint8_t m : t.pickOffered) {
      Action a = act(A_KEEP_MISSIONS);
      a.keep = uint64_t(1) << m;
      out.push_back(a);
    }
    return;
  }
  uint8_t pool[CAP_MISSIONS + CAP_OFFER];
  int n = 0;
  for (uint8_t m : p.missions) pool[n++] = m;
  for (uint8_t m : t.pickOffered) pool[n++] = m;
  std::sort(pool, pool + n);
  int k = std::min<int>(t.pickKeep, n);
  if (k < 0) return;
  // combinations(): lexicographic over the sorted pool.
  int idx[CAP_MISSIONS + CAP_OFFER];
  for (int i = 0; i < k; i++) idx[i] = i;
  while (true) {
    uint64_t mask = 0;
    for (int i = 0; i < k; i++) mask |= uint64_t(1) << pool[idx[i]];
    Action a = act(A_KEEP_MISSIONS);
    a.keep = mask;
    out.push_back(a);
    int i = k - 1;
    while (i >= 0 && idx[i] == n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (int j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

void legalActions(const GameState& s, int player, Actions& out) {
  out.clear();
  if (!s.hasCurrent || s.phase == PH_OVER) return;
  const TurnState& t = s.current;
  if (deciderOf(t) != player) return;
  const PlayerState& p = s.players[player];
  switch (t.step) {
    case ST_NANNY:
      for (const PlayCard& c : p.playArea)
        if (hasKw(c.id, KW_PERMANENT)) {
          Action a = act(A_DISCARD_PERMANENT);
          a.card = c.id;
          out.push_back(a);
        }
      return;
    case ST_MANIPULATE:
      manipulationActions(p, out);
      instantActions(s, p, t, out);
      familiarActions(p, t, out);
      hypnosisActions(s, p, t, out);
      if (!anyMandatoryDraw(p)) out.push_back(act(A_END_MANIPULATION));
      return;
    case ST_MOVE: moveActions(s, p, t, out); return;
    case ST_PUSH: {
      out.push_back(act(A_PUSH));
      int16_t to[MAX_SPACES];
      int n = pushDestinations(graphOf(s), p.pos, to);
      for (int i = 0; i < n; i++) {
        Action a = act(A_PUSH);
        a.space = to[i];
        out.push_back(a);
      }
      return;
    }
    case ST_ACT:
      familiarActions(p, t, out);
      hypnosisActions(s, p, t, out);
      actActions(s, p, t, out);
      return;
    case ST_DIGEST: {
      out.push_back(act(A_DIGEST));
      auto add = [&](int id) {
        if (t.digestCategory >= 0) {
          const CardDef& d = cardDef(id);
          if (!(d.type == CT_HUMAN && d.category == t.digestCategory)) return;
        }
        Action a = act(A_DIGEST);
        a.card = int16_t(id);
        out.push_back(a);
      };
      for (const PlayCard& c : p.playArea) add(c.id);
      for (Card c : p.discard) add(c);
      return;
    }
    case ST_MISSIONS: keepSets(s, p, t, out); return;
    case ST_INSPIRE: {
      const BoardData& b = boardOf(s);
      for (int i = 0; i < b.nCrypts; i++)
        if (!s.crypts[i].empty()) {
          Action a = act(A_INSPIRE);
          a.space = b.crypts[i];
          out.push_back(a);
        }
      return;
    }
    case ST_READY: {
      if (t.readyQueue.empty()) return;
      Action a = act(A_READY);
      a.card = t.readyQueue[0];
      a.spent = 0;
      out.push_back(a);
      a.spent = 1;
      out.push_back(a);
      return;
    }
  }
}

}  // namespace hg
