#include "hg/features.hpp"

#include "hg/ai.hpp"
#include "hg/nosferatu.hpp"

namespace hg {

namespace {

// Global block.
constexpr int GF_PLAYERS = 0;      // 5 (2..6)
constexpr int GF_ROOKIE = 5;
constexpr int GF_SAFE_MTN = 6;
constexpr int GF_TURN = 7;         // 16 (turn 1..15, Parasol turn)
constexpr int GF_STEP = 23;        // 9
constexpr int GF_STAGE2 = 32;
constexpr int GF_SPEED_LEFT = 33;
constexpr int GF_SPEED = 34;
constexpr int GF_HUNTS = 35;
constexpr int GF_MOVED = 36;
constexpr int GF_SPACE_USED = 37;
constexpr int GF_EXTRA_TURN = 38;
constexpr int GF_CONFUSED = 39;
constexpr int GF_HAS_CURRENT = 40;
constexpr int GF_CURRENT = 41;     // 6, relative seat
constexpr int GF_PILE = 47;        // 21 piles × 5
constexpr int GF_COL_DEF = 152;    // 3 × NUM_DEFS
constexpr int GF_TAVERN = 515;     // 5 (0..4+)
constexpr int GF_ROSES = 520;      // 3
constexpr int GF_CHESTS = 523;     // 11 slots × 11
constexpr int GF_CRYPTS = 644;     // 6
constexpr int GF_PUBLIC = 650;     // 50
constexpr int GF_TILES = 700;
constexpr int GF_NEXT_TILE = 701;
constexpr int GF_HUNT_DECK = 702;
constexpr int GF_ARRIVALS = 703;
static_assert(GF_ARRIVALS + 1 == G_DIM);

// Observer-private block.
constexpr int OF_MISSIONS = 0;     // 50
constexpr int OF_MISSION_VP = 50;
constexpr int OF_OFFERED = 51;     // 50
static_assert(OF_OFFERED + 50 == O_DIM);

// Seat block.
constexpr int SF_PRESENT = 0;
constexpr int SF_CURRENT = 1;
constexpr int SF_RESTING = 2;
constexpr int SF_POS = 3;          // 62
constexpr int SF_CASTLE_DIST = 65;
constexpr int SF_SAFE_DIST = 66;
constexpr int SF_LAB_DIST = 67;
constexpr int SF_REGION = 68;      // 5
constexpr int SF_VP = 73;
constexpr int SF_HUNTED = 74;
constexpr int SF_HAND_SPEED = 75;
constexpr int SF_PERM_SPEED = 76;
constexpr int SF_DECK_N = 77;
constexpr int SF_DISCARD_N = 78;
constexpr int SF_HAND_N = 79;
constexpr int SF_HAND = 80;        // NUM_DEFS each
constexpr int SF_PLAY = SF_HAND + NUM_DEFS;
constexpr int SF_DECK = SF_PLAY + NUM_DEFS;
constexpr int SF_DISCARD = SF_DECK + NUM_DEFS;
constexpr int SF_DIGESTED = SF_DISCARD + NUM_DEFS;  // 564
constexpr int SF_BONUS = SF_DIGESTED + NUM_DEFS;    // 685: 9 unused + 9 used
constexpr int SF_ROSE = SF_BONUS + 18;              // 703: 3
constexpr int SF_CASTLE = SF_ROSE + 3;              // 706
constexpr int SF_CASTLE_ORDER = 707;
constexpr int SF_PARASOL_USED = 708;
constexpr int SF_MISSION_N = 709;
constexpr int SF_USED_N = 710;
constexpr int SF_USED = 711;       // 50
constexpr int SF_PUBLIC_VP = 761;
static_assert(SF_DIGESTED == 564 && SF_PUBLIC_VP + 1 == SEAT_DIM);

constexpr int NUM_BONUS_KINDS = 9;

int roseIndex(int card) {
  for (int i = 0; i < NUM_ROSES; i++)
    if (ROSE_EXPAND[i] == card) return i;
  return -1;
}

}  // namespace

void encodeState(const GameState& s, int observer, SparseFeatures& out) {
  out.n = 0;
  const BoardData& b = boardOf(s);
  const int n = s.nPlayers;
  // ---- global
  out.add(GF_PLAYERS + (n - 2), 1);
  out.add(GF_ROOKIE, s.mode == MODE_ROOKIE);
  out.add(GF_SAFE_MTN, s.beginnerSafeMountains);
  out.add(GF_TURN + std::min(15, std::max(0, s.turn - 1)), 1);
  if (s.hasCurrent) {
    const TurnState& t = s.current;
    out.add(GF_HAS_CURRENT, 1);
    out.add(GF_STEP + t.step, 1);
    out.add(GF_STAGE2, t.stage == 2);
    out.add(GF_SPEED_LEFT, t.speedLeft / 10.0f);
    out.add(GF_SPEED, t.speed / 10.0f);
    out.add(GF_HUNTS, t.hunts);
    out.add(GF_MOVED, t.moved);
    out.add(GF_SPACE_USED, t.spaceUsed);
    out.add(GF_EXTRA_TURN, t.extraTurn);
    out.add(GF_CONFUSED, t.confused);
    out.add(GF_CURRENT + relSeat(t.player, observer, n), 1);
  }
  float colDef[3][NUM_DEFS] = {};
  for (int r = 0; r < s.nRows; r++)
    for (int c = 0; c < 3; c++) {
      const auto& pile = s.track[r][c];
      if (pile.empty()) continue;
      int base = GF_PILE + (r * 3 + c) * 5;
      float vp = 0, humans = 0, neg = 0;
      for (Card id : pile) {
        const CardDef& d = cardDef(id);
        vp += d.vp;
        humans += d.type == CT_HUMAN;
        int sp = cardSpeed(id, true);
        if (sp < 0) neg += sp;
        colDef[c][CARD_DEF[id]] += 1;
      }
      out.add(base + 0, pile.size() / 5.0f);
      out.add(base + 1, huntCost(pile.v, pile.n, c) / 3.0f);
      out.add(base + 2, vp / 10.0f);
      out.add(base + 3, humans / 3.0f);
      out.add(base + 4, neg / 3.0f);
    }
  for (int c = 0; c < 3; c++)
    for (int d = 0; d < NUM_DEFS; d++) out.add(GF_COL_DEF + c * NUM_DEFS + d, colDef[c][d]);
  out.add(GF_TAVERN + std::min(4, int(s.tavern.size())), 1);
  for (Card r : s.roses) {
    int k = roseIndex(r);
    if (k >= 0) out.add(GF_ROSES + k, 1);
  }
  for (int i = 0; i < b.nChests; i++) {
    int base = GF_CHESTS + i * 11;
    int tok = s.chests[i];
    if (tok < 0) out.add(base + 1, 1);
    else if (b.spaces[b.chests[i]].effect == E_CHEST) out.add(base + 0, 1);  // face down
    else out.add(base + 2 + BONUS_DEFS[tok].kind, 1);
  }
  for (int i = 0; i < b.nCrypts; i++) out.add(GF_CRYPTS + i, s.crypts[i].size() / 6.0f);
  for (uint8_t m : s.publicMissions) out.add(GF_PUBLIC + m, 1);
  out.add(GF_TILES, s.castleTiles.size() / 5.0f);
  if (!s.castleTiles.empty()) out.add(GF_NEXT_TILE, s.castleTiles[0] / 10.0f);
  out.add(GF_HUNT_DECK, s.huntDeck.size() / 100.0f);
  out.add(GF_ARRIVALS, s.castleArrivals);

  // Mission scores for every seat (public Missions are public; own ones private).
  Tally tallies[MAX_PLAYERS];
  int pre[MAX_PLAYERS];
  MissionContext ctx;

  // ---- observer-private
  {
    const PlayerState& me = s.players[observer];
    missionContext(s, observer, tallies, pre, ctx);
    int vp = 0;
    for (uint8_t m : me.missions) {
      out.add(G_DIM + OF_MISSIONS + m, 1);
      const MissionDef& def = MISSION_DEFS[m];
      if (def.std >= 0) vp += def.std == SK_MISSIONARY ? int(me.missions.size()) : missionScore(def, ctx);
    }
    out.add(G_DIM + OF_MISSION_VP, vp / 20.0f);
    if (s.hasCurrent && s.current.player == observer && s.current.hasPick)
      for (uint8_t m : s.current.pickOffered) out.add(G_DIM + OF_OFFERED + m, 1);
  }

  // ---- seats
  for (int i = 0; i < n; i++) {
    const PlayerState& p = s.players[i];
    const int base = G_DIM + O_DIM + relSeat(i, observer, n) * SEAT_DIM;
    out.add(base + SF_PRESENT, 1);
    out.add(base + SF_CURRENT, s.hasCurrent && s.current.player == i);
    out.add(base + SF_RESTING, p.resting);
    out.add(base + SF_POS + p.pos, 1);
    out.add(base + SF_CASTLE_DIST, b.castleDist[p.pos] / 35.0f);
    out.add(base + SF_SAFE_DIST, safeDistance(s, p.pos) / 35.0f);
    out.add(base + SF_LAB_DIST, b.labyrinthDist[p.pos] / 35.0f);
    out.add(base + SF_REGION + b.spaces[p.pos].region, 1);
    out.add(base + SF_VP, p.vp / 100.0f);
    out.add(base + SF_HUNTED, p.hunted / 20.0f);
    out.add(base + SF_HAND_SPEED, float(nos::expectedHandSpeed(p)) / 10.0f);
    int perm = 0;
    for (const PlayCard& c : p.playArea)
      if (hasKw(c.id, KW_PERMANENT)) perm += cardSpeed(c.id, false);
    out.add(base + SF_PERM_SPEED, perm / 5.0f);
    out.add(base + SF_DECK_N, p.deck.size() / 20.0f);
    out.add(base + SF_DISCARD_N, p.discard.size() / 20.0f);
    out.add(base + SF_HAND_N, p.hand.size() / 5.0f);
    float zone[5][NUM_DEFS] = {};
    for (Card c : p.hand) zone[0][CARD_DEF[c]] += 1;
    for (const PlayCard& c : p.playArea) zone[1][CARD_DEF[c.id]] += 1;
    for (Card c : p.deck) zone[2][CARD_DEF[c]] += 1;
    for (Card c : p.discard) zone[3][CARD_DEF[c]] += 1;
    for (Card c : p.digested) zone[4][CARD_DEF[c]] += 1;
    for (int z = 0; z < 5; z++)
      for (int d = 0; d < NUM_DEFS; d++) out.add(base + SF_HAND + z * NUM_DEFS + d, zone[z][d]);
    float unused[NUM_BONUS_KINDS] = {}, used[NUM_BONUS_KINDS] = {};
    for (const BonusHolding& h : p.bonus) (h.used ? used : unused)[BONUS_DEFS[h.id].kind] += 1;
    for (int k = 0; k < NUM_BONUS_KINDS; k++) {
      out.add(base + SF_BONUS + k, unused[k]);
      out.add(base + SF_BONUS + NUM_BONUS_KINDS + k, used[k]);
    }
    auto roseOf = [&](int card) {
      int k = roseIndex(card);
      if (k >= 0) out.add(base + SF_ROSE + k, 1);
    };
    for (Card c : p.deck) roseOf(c);
    for (Card c : p.hand) roseOf(c);
    for (Card c : p.discard) roseOf(c);
    for (const PlayCard& c : p.playArea) roseOf(c.id);
    out.add(base + SF_CASTLE, p.castleOrder >= 0);
    if (p.castleOrder >= 0) out.add(base + SF_CASTLE_ORDER, p.castleOrder / 6.0f);
    out.add(base + SF_PARASOL_USED, p.parasolTurnUsed);
    out.add(base + SF_MISSION_N, p.missions.size() / 5.0f);
    out.add(base + SF_USED_N, p.usedMissions.size());
    for (uint8_t m : p.usedMissions) out.add(base + SF_USED + m, 1);
    missionContext(s, i, tallies, pre, ctx);
    int pub = 0;
    for (uint8_t m : s.publicMissions) pub += missionScore(MISSION_DEFS[m], ctx);
    out.add(base + SF_PUBLIC_VP, pub / 10.0f);
  }
}

namespace {
constexpr int AF_TYPE = 0;         // 20
constexpr int AF_SPACE = 20;       // 62
constexpr int AF_SPENT = 82;       // 16
constexpr int AF_CARD = 98;        // NUM_DEFS
constexpr int AF_OTHER = 219;      // NUM_DEFS
constexpr int AF_PILE = 340;       // 21
constexpr int AF_PILE_DEF = 361;   // NUM_DEFS
constexpr int AF_MISSION = 482;    // 50
constexpr int AF_KEEP = 532;       // 50
constexpr int AF_TOKEN = 582;      // 9
constexpr int AF_READY = 591;      // 2
constexpr int AF_NO_PUSH = 593;
constexpr int AF_NO_DIGEST = 594;
static_assert(AF_NO_DIGEST + 1 == ACTION_DIM);
}  // namespace

void encodeAction(const GameState& s, const Action& a, ActionFeatures& out) {
  out.n = 0;
  out.add(AF_TYPE + a.type, 1);
  switch (a.type) {
    case A_MOVE:
      out.add(AF_SPACE + a.space, 1);
      out.add(AF_SPENT + std::min(15, std::max(0, int(a.spent))), 1);
      break;
    case A_MIST:
    case A_INSPIRE:
      if (a.space >= 0) out.add(AF_SPACE + a.space, 1);
      break;
    case A_PUSH:
      if (a.space >= 0) out.add(AF_SPACE + a.space, 1);
      else out.add(AF_NO_PUSH, 1);
      break;
    case A_DIGEST:
      if (a.card >= 0) out.add(AF_CARD + CARD_DEF[a.card], 1);
      else out.add(AF_NO_DIGEST, 1);
      break;
    case A_KEEP_MISSIONS:
      for (int m = 0; m < NUM_MISSIONS; m++)
        if ((a.keep >> m) & 1) out.add(AF_KEEP + m, 1);
      break;
    case A_HUNT: {
      out.add(AF_PILE + a.row * 3 + a.col, 1);
      const auto& pile = s.track[a.row][a.col];
      float defs[NUM_DEFS] = {};
      for (Card c : pile) defs[CARD_DEF[c]] += 1;
      for (int d = 0; d < NUM_DEFS; d++) out.add(AF_PILE_DEF + d, defs[d]);
      break;
    }
    case A_INSTANT:
      if (a.mission >= 0) out.add(AF_MISSION + a.mission, 1);
      if (a.row >= 0 && a.col >= 0) out.add(AF_PILE + a.row * 3 + a.col, 1);
      if (a.card >= 0) out.add(AF_CARD + CARD_DEF[a.card], 1);
      if (a.space >= 0) out.add(AF_SPACE + a.space, 1);
      break;
    case A_USE_BONUS:
      if (a.token >= 0) out.add(AF_TOKEN + BONUS_DEFS[a.token].kind, 1);
      if (a.other >= 0) out.add(AF_OTHER + CARD_DEF[a.other], 1);
      break;
    case A_READY:
      if (a.card >= 0) out.add(AF_CARD + CARD_DEF[a.card], 1);
      out.add(AF_READY + (a.spent == 1 ? 1 : 0), 1);
      break;
    case A_HYPNOSIS:
      if (a.other >= 0) out.add(AF_OTHER + CARD_DEF[a.other], 1);
      if (a.row >= 0 && a.col >= 0) out.add(AF_PILE + a.row * 3 + a.col, 1);
      break;
    default:
      if (a.card >= 0) out.add(AF_CARD + CARD_DEF[a.card], 1);
      if (a.other >= 0) out.add(AF_OTHER + CARD_DEF[a.other], 1);
      break;
  }
}

}  // namespace hg
