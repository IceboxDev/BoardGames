// Final scoring — a port of scoring.ts.
#include <algorithm>
#include <cstring>

#include "hg/engine.hpp"

namespace hg {

template <class F>
static void forOwned(const PlayerState& p, F f) {
  for (Card c : p.deck) f(c);
  for (Card c : p.hand) f(c);
  for (const PlayCard& c : p.playArea) f(c.id);
  for (Card c : p.discard) f(c);
  for (Card c : p.digested) f(c);
}

void tally(const PlayerState& p, const int8_t* choices, int nChoices, Tally& t) {
  std::memset(t.humans, 0, sizeof t.humans);
  t.nHumanCards = 0;
  t.familiars = t.powers = 0;
  bool famSeen[NUM_DEFS] = {};
  bool powSeen[NUM_DEFS] = {};
  int distinctF = 0, distinctP = 0;
  t.hasRose = false;
  forOwned(p, [&](int id) {
    int di = CARD_DEF[id];
    const CardDef& d = CARD_DEFS[di];
    if (d.type == CT_HUMAN && d.category >= 0) {
      t.humans[d.category] += 1;
      t.humanDefs[t.nHumanCards++] = uint8_t(di);
    }
    if (d.type == CT_FAMILIAR) {
      t.familiars += 1;
      if (!famSeen[di]) famSeen[di] = true, distinctF++;
    }
    if (d.type == CT_POWER) {
      t.powers += 1;
      if (!powSeen[di]) powSeen[di] = true, distinctP++;
    }
    if (d.family == FAM_ROSE) t.hasRose = true;
  });
  int choice = 0;
  for (const BonusHolding& b : p.bonus) {
    const BonusDef& bd = BONUS_DEFS[b.id];
    if (bd.kind == BK_HUMAN) t.humans[bd.category] += 1;
    if (bd.kind == BK_HUMAN_CHOICE) {
      int cat = b.chosen >= 0 ? b.chosen : (choice < nChoices ? choices[choice++] : (choice++, -1));
      if (cat >= 0) t.humans[cat] += 1;
    }
  }
  t.humanTotal = t.humans[0] + t.humans[1] + t.humans[2] + t.humans[3];
  t.distinctFamiliars = distinctF;
  t.distinctPowers = distinctP;
  int dh = 0;
  for (Card c : p.digested)
    if (cardDef(c).type == CT_HUMAN) dh++;
  t.digestedHumans = dh;
  t.bonus = p.bonus.size();
  t.castleOrder = p.castleOrder;
}

/** cardBonusLines: each End-of-the-Game card and its VP, in owned order. */
static int cardBonusLines(const PlayerState& p, CardLine* out) {
  bool defOwned[NUM_DEFS] = {};
  int famCount[NUM_FAMILIES] = {};
  int catCount[NUM_CATEGORIES] = {};
  forOwned(p, [&](int id) {
    const CardDef& d = cardDef(id);
    defOwned[CARD_DEF[id]] = true;
    if (d.family >= 0) famCount[d.family]++;
    if (d.type == CT_HUMAN && d.category >= 0) catCount[d.category]++;
  });
  int n = 0;
  forOwned(p, [&](int id) {
    const EndGame& e = cardDef(id).endGame;
    if (e.kind == EG_NONE) return;
    int vp = 0;
    if (e.kind == EG_IF_HAS && defOwned[e.other]) vp = e.vp;
    if (e.kind == EG_IF_FAMILY && famCount[e.family] > 0) vp = e.vp;
    if (e.kind == EG_PER_CATEGORY) vp = e.vp * catCount[e.category];
    if (e.kind == EG_PER_FAMILY) vp = e.vp * famCount[e.family];
    if (out) out[n] = CardLine{Card(id), int8_t(vp)};
    n++;
  });
  return n;
}

int cardBonuses(const PlayerState& p) {
  CardLine lines[CAP_DECK * 2];
  int n = cardBonusLines(p, lines);
  int sum = 0;
  for (int i = 0; i < n; i++) sum += lines[i].vp;
  return sum;
}

static bool strictlyMost(int mine, const int* others, int n) {
  for (int i = 0; i < n; i++)
    if (!(mine > others[i])) return false;
  return true;
}
static bool strictlyFewest(int mine, const int* others, int n) {
  for (int i = 0; i < n; i++)
    if (!(mine < others[i])) return false;
  return true;
}
static int majorityCount(const Tally& t, int of) {
  if (of == OF_HUMANS) return t.humanTotal;
  if (of == OF_FAMILIARS) return t.familiars;
  return t.humans[of];
}

int missionScore(const MissionDef& c, const MissionContext& ctx) {
  const Tally& me = *ctx.me;
  const int* counts = me.humans;
  int others[MAX_PLAYERS];
  int vp = c.vp;
  switch (c.std) {
    case SK_PER_CATEGORY: return c.vpEach * me.humans[c.category];
    case SK_MAJORITY:
      for (int i = 0; i < ctx.nOthers; i++) others[i] = majorityCount(*ctx.others[i], c.of);
      return strictlyMost(majorityCount(me, c.of), others, ctx.nOthers) ? vp : 0;
    case SK_FEWEST_HUMANS:
      for (int i = 0; i < ctx.nOthers; i++) others[i] = ctx.others[i]->humanTotal;
      return strictlyFewest(me.humanTotal, others, ctx.nOthers) ? vp : 0;
    case SK_HAS_ROSE: return me.hasRose ? vp : 0;
    case SK_HOST: {
      int mine = me.castleOrder;
      if (mine < 0) return 0;
      int beaten = 0;
      for (int i = 0; i < ctx.nOthers; i++) {
        int o = ctx.others[i]->castleOrder;
        if (o < 0 || o > mine) beaten++;
      }
      return vp + c.perBeaten * beaten;
    }
    case SK_PER_BONUS: return c.vpEach * me.bonus;
    case SK_PER_HUMAN_WORTH: {
      int n = 0;
      for (int i = 0; i < me.nHumanCards; i++) {
        int v = CARD_DEFS[me.humanDefs[i]].vp;
        if (v >= c.min && (c.max < 0 || v <= c.max)) n++;
      }
      return c.vpEach * n;
    }
    case SK_NONE_WORTH:
      for (int i = 0; i < me.nHumanCards; i++)
        if (CARD_DEFS[me.humanDefs[i]].vp >= c.atLeast) return 0;
      return vp;
    case SK_SAME_TYPE:
      for (int i = 0; i < NUM_CATEGORIES; i++)
        if (counts[i] >= c.atLeast) return vp;
      return 0;
    case SK_PER_KEYWORD: {
      int n = 0;
      for (int i = 0; i < me.nHumanCards; i++)
        if (CARD_DEFS[me.humanDefs[i]].kw & c.keywords) n++;
      return c.vpEach * n;
    }
    case SK_PER_DISTINCT:
      return c.vpEach * (c.distinct == CT_POWER ? me.distinctPowers : me.distinctFamiliars);
    case SK_LEAST_TYPE:
    case SK_SETS: return c.vpEach * std::min(std::min(counts[0], counts[1]), std::min(counts[2], counts[3]));
    case SK_MOST_TYPE: return c.vpEach * std::max(std::max(counts[0], counts[1]), std::max(counts[2], counts[3]));
    case SK_SCORE_RANK:
      return (c.rank == 0 ? strictlyMost(ctx.preScore, ctx.otherPreScores, ctx.nOthers)
                          : strictlyFewest(ctx.preScore, ctx.otherPreScores, ctx.nOthers))
                 ? vp
                 : 0;
    case SK_COUNT_HUMANS: return me.humanTotal >= c.atLeast ? vp : 0;
    case SK_MISSIONARY: return 0;
    case SK_PER_DIGESTED: return c.vpEach * me.digestedHumans;
    case SK_FIRST_HOME: return me.castleOrder == 1 ? vp : 0;
    default: return 0;
  }
}

/** missionLines: per tile VP; Missionary = scoring tiles in the set + Missionaries. */
static int missionLines(const uint8_t* ids, int n, const MissionContext& ctx, int8_t* vps) {
  int missionaries = 0, scoring = 0;
  for (int i = 0; i < n; i++) {
    const MissionDef& d = MISSION_DEFS[ids[i]];
    vps[i] = int8_t(d.std >= 0 && d.std != SK_MISSIONARY ? missionScore(d, ctx) : 0);
    if (d.std == SK_MISSIONARY) missionaries++;
  }
  for (int i = 0; i < n; i++)
    if (vps[i] > 0) scoring++;
  int sum = 0;
  for (int i = 0; i < n; i++) {
    if (MISSION_DEFS[ids[i]].std == SK_MISSIONARY) vps[i] = int8_t(scoring + missionaries);
    sum += vps[i];
  }
  return sum;
}

static int scoreMissions(const uint8_t* ids, int n, const MissionContext& ctx) {
  int8_t vps[64];
  return missionLines(ids, n, ctx, vps);
}

void fateOf(const GameState& s, const PlayerState& p, int& fate, int& delta) {
  const Space& sp = spaceOf(s, p.pos);
  if (sp.region == R_CASTLE) {
    fate = F_CASTLE, delta = 0;
    return;
  }
  if (sp.region == R_CEMETERY) {
    fate = F_CEMETERY, delta = -5;
    return;
  }
  if (sp.region == R_MOUNTAINS) {
    if (s.mode == MODE_ROOKIE) {
      fate = F_MOUNTAINS, delta = -(sp.mountainPenalty >= 0 ? sp.mountainPenalty : 0);
      return;
    }
    if (s.beginnerSafeMountains) {
      fate = F_MOUNTAINS, delta = 0;
      return;
    }
  }
  fate = F_ASHES, delta = 0;
}

static void preMissionScores(const GameState& s, int* pre) {
  for (int i = 0; i < s.nPlayers; i++) {
    int fate, delta;
    fateOf(s, s.players[i], fate, delta);
    pre[i] = s.players[i].vp + delta + cardBonuses(s.players[i]);
  }
}

static void contextFor(int seat, int n, const Tally* tallies, const int* pre, MissionContext& ctx) {
  ctx.me = &tallies[seat];
  ctx.nOthers = 0;
  for (int i = 0; i < n; i++) {
    if (i == seat) continue;
    ctx.others[ctx.nOthers] = &tallies[i];
    ctx.otherPreScores[ctx.nOthers] = pre[i];
    ctx.nOthers++;
  }
  ctx.preScore = pre[seat];
}

void missionContext(const GameState& s, int seat, Tally* tallies, int* pre, MissionContext& ctx) {
  for (int i = 0; i < s.nPlayers; i++) tally(s.players[i], nullptr, 0, tallies[i]);
  preMissionScores(s, pre);
  contextFor(seat, s.nPlayers, tallies, pre, ctx);
}

static void resolveChoiceTokens(GameState& s) {
  int n = s.nPlayers;
  static thread_local Tally base[MAX_PLAYERS], tallies[MAX_PLAYERS];
  int pre[MAX_PLAYERS];
  for (int i = 0; i < n; i++) tally(s.players[i], nullptr, 0, base[i]);
  preMissionScores(s, pre);
  for (int pi = 0; pi < n; pi++) {
    PlayerState& p = s.players[pi];
    int k = 0;
    for (const BonusHolding& b : p.bonus)
      if (BONUS_DEFS[b.id].kind == BK_HUMAN_CHOICE && b.chosen < 0) k++;
    if (k == 0) continue;
    int8_t best[CAP_BONUS] = {};
    int8_t pick[CAP_BONUS];
    bool have = false;
    int bestVp = 0;
    long total = 1;
    for (int i = 0; i < k; i++) total *= NUM_CATEGORIES;
    for (long code = 0; code < total; code++) {
      long c = code;
      for (int j = 0; j < k; j++) {
        pick[j] = int8_t(c % NUM_CATEGORIES);
        c /= NUM_CATEGORIES;
      }
      for (int i = 0; i < n; i++) tallies[i] = base[i];
      tally(p, pick, k, tallies[pi]);
      MissionContext ctx;
      contextFor(pi, n, tallies, pre, ctx);
      int vp = scoreMissions(s.publicMissions.v, s.publicMissions.n, ctx) +
               scoreMissions(p.missions.v, p.missions.n, ctx);
      if (!have || vp > bestVp) {
        have = true;
        bestVp = vp;
        std::memcpy(best, pick, k);
      }
    }
    int i = 0;
    for (BonusHolding& b : p.bonus)
      if (BONUS_DEFS[b.id].kind == BK_HUMAN_CHOICE && b.chosen < 0) b.chosen = best[i++];
  }
}

void computeResult(GameState& s) {
  resolveChoiceTokens(s);
  int n = s.nPlayers;
  static thread_local Tally tallies[MAX_PLAYERS];
  int pre[MAX_PLAYERS];
  for (int i = 0; i < n; i++) tally(s.players[i], nullptr, 0, tallies[i]);
  preMissionScores(s, pre);
  const BoardData& b = boardOf(s);
  Result& r = s.result;
  std::memset(static_cast<void*>(&r), 0, sizeof r);
  for (int pi = 0; pi < n; pi++) {
    const PlayerState& p = s.players[pi];
    SeatBreakdown& bd = r.breakdown[pi];
    MissionContext ctx;
    contextFor(pi, n, tallies, pre, ctx);
    CardLine lines[CAP_DECK * 2];
    int nl = cardBonusLines(p, lines);
    int cards = 0;
    for (int i = 0; i < nl; i++) {
      cards += lines[i].vp;
      bd.cards.push(lines[i]);
    }
    int8_t pubV[64], perV[64];
    int pub = missionLines(s.publicMissions.v, s.publicMissions.n, ctx, pubV);
    int personal = missionLines(p.missions.v, p.missions.n, ctx, perV);
    int fate, delta;
    fateOf(s, p, fate, delta);
    for (int i = 0; i < s.publicMissions.n; i++)
      bd.missions.push(MissionLine{s.publicMissions[i], pubV[i], true, false});
    for (int i = 0; i < p.missions.n; i++)
      bd.missions.push(MissionLine{p.missions[i], perV[i], false, false});
    for (uint8_t m : p.usedMissions) bd.missions.push(MissionLine{m, 0, false, true});
    bd.duringPlay = p.vp;
    bd.cardBonuses = int16_t(cards);
    bd.publicMissions = int16_t(pub);
    bd.personalMissions = int16_t(personal);
    bd.sunrise = int16_t(delta);
    bd.fate = int8_t(fate);
    bd.total = int16_t(p.vp + cards + pub + personal + delta);
  }
  int8_t rank[MAX_PLAYERS];
  for (int i = 0; i < n; i++) rank[i] = int8_t(i);
  const int BIG = 1 << 30;
  std::stable_sort(rank, rank + n, [&](int8_t a, int8_t c) {
    const SeatBreakdown& ba = r.breakdown[a];
    const SeatBreakdown& bb = r.breakdown[c];
    int sa = ba.fate == F_ASHES ? 1 : 0, sb = bb.fate == F_ASHES ? 1 : 0;
    if (sa != sb) return sa < sb;
    if (ba.total != bb.total) return bb.total < ba.total;
    int ca = s.players[a].castleOrder >= 0 ? s.players[a].castleOrder : BIG;
    int cb = s.players[c].castleOrder >= 0 ? s.players[c].castleOrder : BIG;
    if (ca != cb) return ca < cb;
    return b.castleDist[s.players[a].pos] < b.castleDist[s.players[c].pos];
  });
  auto sameKey = [&](int a, int c) {
    const SeatBreakdown& ba = r.breakdown[a];
    const SeatBreakdown& bb = r.breakdown[c];
    return (ba.fate == F_ASHES) == (bb.fate == F_ASHES) && ba.total == bb.total &&
           s.players[a].castleOrder == s.players[c].castleOrder &&
           b.castleDist[s.players[a].pos] == b.castleDist[s.players[c].pos];
  };
  for (int i = 0; i < n; i++) {
    int p = rank[i];
    r.placements[p] =
        int8_t(i > 0 && sameKey(rank[i - 1], p) ? r.placements[rank[i - 1]] : i + 1);
  }
  r.winners.clear();
  for (int i = 0; i < n; i++)
    if (r.placements[rank[i]] == 1) r.winners.push(rank[i]);
  r.winner = r.winners.size() == 1 ? r.winners[0] : -1;
  for (int i = 0; i < n; i++) r.scores[i] = r.breakdown[i].total;
  s.hasResult = true;
}

}  // namespace hg
