#include "sw/payment.hpp"

#include <algorithm>
#include <cassert>

#include "sw/wonders.hpp"

namespace sw {

namespace {

constexpr int MAXP = 64;  // max production entries per pool

// Own production: wonder initial resource + ALL tableau production (any color) +
// built-stage production + Edifice bonus production. Entries are resource masks
// (multi-bit = choose one); single-resource producers expand by `count`.
int collectOwn(const GameState& st, int pi, uint8_t* out) {
  const PlayerState& p = st.players[pi];
  int n = 0;
  out[n++] = bit(Resource(wonderSide(p.wonderId, p.side).initialResource));
  for (int t = 0; t < p.numTableau; t++) {
    const Card& c = cardType(p.tableau[t]);
    for (int e = 0; e < c.numEffects; e++)
      if (c.effects[e].kind == EffectKind::Production)
        for (int k = 0; k < c.effects[e].count; k++) out[n++] = c.effects[e].resMask;
  }
  const WonderSide& ws = wonderSide(p.wonderId, p.side);
  for (int s = 0; s < p.stagesBuilt; s++)
    for (int e = 0; e < ws.stages[s].numEffects; e++)
      if (ws.stages[s].effects[e].kind == EffectKind::Production)
        for (int k = 0; k < ws.stages[s].effects[e].count; k++)
          out[n++] = ws.stages[s].effects[e].resMask;
  for (int b = 0; b < p.numBonusProd; b++) out[n++] = p.bonusProd[b];
  assert(n <= MAXP);
  return n;
}

// Tradeable production: wonder initial resource + brown/grey card production only
// (yellow choice-producers, stage production, and edifice output are NOT sellable).
int collectTradeable(const GameState& st, int pi, uint8_t* out) {
  const PlayerState& p = st.players[pi];
  int n = 0;
  out[n++] = bit(Resource(wonderSide(p.wonderId, p.side).initialResource));
  for (int t = 0; t < p.numTableau; t++) {
    const Card& c = cardType(p.tableau[t]);
    if (c.color != Brown && c.color != Grey) continue;
    for (int e = 0; e < c.numEffects; e++)
      if (c.effects[e].kind == EffectKind::Production)
        for (int k = 0; k < c.effects[e].count; k++) out[n++] = c.effects[e].resMask;
  }
  assert(n <= MAXP);
  return n;
}

struct Solver {
  const GameState* st;
  int player;
  const uint8_t* pools[3];  // 0=own, 1=left, 2=right
  int poolLen[3];
  bool used[3][MAXP];
  uint8_t req[16];
  int nreq;
  int budget;
  Split sols[MAX_SPLITS];
  int nsol;

  bool dominated(Split s) const {
    for (int i = 0; i < nsol; i++)
      if (sols[i].left <= s.left && sols[i].right <= s.right) return true;
    return false;
  }
  void record(Split acc) {
    if (dominated(acc)) return;
    int w = 0;
    for (int i = 0; i < nsol; i++)
      if (!(sols[i].left >= acc.left && sols[i].right >= acc.right)) sols[w++] = sols[i];
    nsol = w;
    if (nsol < MAX_SPLITS) sols[nsol++] = acc;
  }
  void tryPool(int unit, int poolIdx, Split acc) {
    int resource = req[unit];
    uint8_t b = bit(Resource(resource));
    const uint8_t* pool = pools[poolIdx];
    int len = poolLen[poolIdx];
    uint64_t seenLo = 0, seenHi = 0;  // dedup identical unused masks (0..127)
    for (int i = 0; i < len; i++) {
      if (used[poolIdx][i] || !(pool[i] & b)) continue;
      uint8_t m = pool[i];
      uint64_t& word = (m < 64) ? seenLo : seenHi;
      uint64_t mbit = uint64_t(1) << (m & 63);
      if (word & mbit) continue;
      word |= mbit;
      int coins = (poolIdx == 0) ? 0 : getTradeCost(*st, player, poolIdx == 1 ? 0 : 1, resource);
      Split next = acc;
      if (poolIdx == 1)
        next.left = uint8_t(next.left + coins);
      else if (poolIdx == 2)
        next.right = uint8_t(next.right + coins);
      if (next.left + next.right > budget || dominated(next)) continue;
      used[poolIdx][i] = true;
      solve(unit + 1, next);
      used[poolIdx][i] = false;
    }
  }
  void solve(int unit, Split acc) {
    if (unit == nreq) {
      record(acc);
      return;
    }
    tryPool(unit, 0, acc);
    tryPool(unit, 1, acc);
    tryPool(unit, 2, acc);
  }
};

}  // namespace

int getTradeCost(const GameState& st, int buyer, int side, int resource) {
  bool raw = (bit(Resource(resource)) & RAW_MASK) != 0;
  const PlayerState& p = st.players[buyer];
  uint8_t sideBit = side == 0 ? 1 : 2;  // left=bit0, right=bit1
  auto match = [&](const Effect& e) {
    return e.kind == EffectKind::TradeDiscount && (bool(e.tradeRaw) == raw) && (e.neighbors & sideBit);
  };
  for (int t = 0; t < p.numTableau; t++) {
    const Card& c = cardType(p.tableau[t]);
    for (int e = 0; e < c.numEffects; e++)
      if (match(c.effects[e])) return 1;
  }
  const WonderSide& ws = wonderSide(p.wonderId, p.side);
  for (int s = 0; s < p.stagesBuilt; s++)
    for (int e = 0; e < ws.stages[s].numEffects; e++)
      if (match(ws.stages[s].effects[e])) return 1;
  return 2;
}

PayResult solvePayments(const GameState& st, int player, const uint8_t* resCost, int bankCoins) {
  PayResult res;
  const PlayerState& p = st.players[player];
  if (bankCoins > p.coins) return res;  // affordable = false

  Solver s;
  s.nreq = 0;
  for (int r = 0; r < NUM_RESOURCES; r++)
    for (int c = 0; c < resCost[r]; c++) s.req[s.nreq++] = uint8_t(r);
  if (s.nreq == 0) {
    res.affordable = true;
    res.count = 1;
    res.splits[0] = Split{0, 0};
    return res;
  }

  s.st = &st;
  s.player = player;
  uint8_t ownBuf[MAXP], leftBuf[MAXP], rightBuf[MAXP];
  s.poolLen[0] = collectOwn(st, player, ownBuf);
  s.pools[0] = ownBuf;
  s.poolLen[1] = collectTradeable(st, leftOf(player), leftBuf);
  s.pools[1] = leftBuf;
  s.poolLen[2] = collectTradeable(st, rightOf(player), rightBuf);
  s.pools[2] = rightBuf;

  // Scarcity sort (tighter pruning; result set is order-independent).
  auto providers = [&](int r) {
    uint8_t b = bit(Resource(r));
    int n = 0;
    for (int pi = 0; pi < 3; pi++)
      for (int i = 0; i < s.poolLen[pi]; i++)
        if (s.pools[pi][i] & b) n++;
    return n;
  };
  std::stable_sort(s.req, s.req + s.nreq,
                   [&](uint8_t a, uint8_t b) { return providers(a) < providers(b); });

  s.budget = p.coins - bankCoins;
  for (int i = 0; i < 3; i++)
    std::fill(s.used[i], s.used[i] + s.poolLen[i], false);
  s.nsol = 0;
  s.solve(0, Split{0, 0});

  if (s.nsol == 0) return res;  // affordable = false
  std::sort(s.sols, s.sols + s.nsol, [](Split a, Split b) {
    int ta = a.left + a.right, tb = b.left + b.right;
    return ta != tb ? ta < tb : a.left < b.left;
  });
  res.affordable = true;
  res.count = s.nsol;
  for (int i = 0; i < s.nsol; i++) res.splits[i] = s.sols[i];
  return res;
}

}  // namespace sw
