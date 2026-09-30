#include "hg/rollpol.hpp"

#include <algorithm>
#include <cstdio>
#include <cstring>

#include "hg/ai.hpp"
#include "hg/nosferatu.hpp"

namespace hg {

using namespace nos;

// Feature indices (keep in step with train/rollpol.py FEATURE_NAMES).
enum : int {
  PF_TYPE = 0,  // 20: action type one-hot
  PF_NOS = 20,  // Nosferatu would play this
  // destination (move / mist / stay)
  PF_HUNT_FROM = 21, PF_SPACE_VALUE, PF_RISK, PF_WELL, PF_CASTLE, PF_CASTLE_VALUE, PF_D_CASTLE, PF_D_SAFE,
  PF_D_LAB, PF_D_LAB_ROSE, PF_FOREST, PF_PLAINS, PF_MOUNTAINS, PF_CEMETERY, PF_HOME_SHORT, PF_HOME_SHORT_LATE,
  PF_TAVERN, PF_CHEST, PF_CRYPT, PF_UNUSED40, PF_RIVALS_LATE, PF_RIVALS, PF_SPENT,
  PF_UNUSED44,
  // hunt (a Hunt Track pile)
  PF_VP = 45, PF_REGION_VP, PF_NEG_SPEED, PF_NEG_SPEED_LATE, PF_POS_SPEED, PF_POS_SPEED_EARLY, PF_FAMILIARS,
  PF_POWERS, PF_PERMANENTS, PF_CONFUSE, PF_CONFUSE_EARLY, PF_SPICY, PF_HOLY_WATER, PF_MISSION_FIT, PF_END_GAME,
  PF_COST, PF_PILE_N, PF_ROSE, PF_TAVERN_HUNT,
  // other decisions
  PF_BADNESS = 64, PF_DIGEST_HUMAN, PF_MISSIONS, PF_INSPIRE, PF_READY_GOOD, PF_PUSH_SAFE, PF_PUSH_NONE,
  PF_SPEED_AFTER,
};
static_assert(PF_SPEED_AFTER + 1 == POL_FEATURES);

namespace {

bool fileBytes(const std::string& path, std::vector<uint8_t>& out) {
#ifdef __wasi__
  (void)path;
  (void)out;
  return false;
#else
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return false;
  uint8_t buf[4096];
  size_t k;
  while ((k = std::fread(buf, 1, sizeof buf, f)) > 0) out.insert(out.end(), buf, buf + k);
  std::fclose(f);
  return true;
#endif
}

}  // namespace

bool RollPolicy::loadBytes(const uint8_t* data, size_t n) {
  loaded = false;
  uint32_t magic, count;
  if (n != 8 + 4 * size_t(POL_FEATURES)) return false;
  std::memcpy(&magic, data, 4);
  std::memcpy(&count, data + 4, 4);
  if (magic != POL_MAGIC || count != uint32_t(POL_FEATURES)) return false;
  std::memcpy(w, data + 8, sizeof w);
  return loaded = true;
}

bool RollPolicy::load(const std::string& path) {
  std::vector<uint8_t> bytes;
  return fileBytes(path, bytes) && loadBytes(bytes.data(), bytes.size());
}

void policyFeatures(const GameState& s, int seat, const Action& a, bool isNos, float* f) {
  std::fill(f, f + POL_FEATURES, 0.f);
  const PlayerState& p = s.players[seat];
  const BoardData& b = boardOf(s);
  const Graph& g = graphOf(s);
  const double t = double(s.turn) / double(TURNS);
  const double early = std::max(0.0, 1.0 - double(s.turn - 1) / 7.0);
  const double late = t;
  f[PF_TYPE + a.type] = 1;
  f[PF_NOS] = isNos;
  const int speedLeft = s.hasCurrent ? s.current.speedLeft : 0;
  switch (a.type) {
    case A_MOVE:
    case A_MIST:
    case A_STAY: {
      int d = a.type == A_STAY ? p.pos : a.space;
      int spent = a.type == A_MOVE ? a.spent : 0;
      f[PF_HUNT_FROM] = float(bestHuntFrom(s, p, d, speedLeft - spent) / 10);
      f[PF_SPACE_VALUE] = float(spaceValue(s, p, d) / 5);
      f[PF_RISK] = float(std::min(20.0, risk(s, p, d)) / 20);
      f[PF_WELL] = isWell(g, d);
      if (d == b.castle) {
        f[PF_CASTLE] = 1;
        f[PF_CASTLE_VALUE] = float(castleArrivalValue(s) / 10);
      }
      f[PF_D_CASTLE] = float(int(b.castleDist[d]) - int(b.castleDist[p.pos])) / 10.f;
      f[PF_D_SAFE] = float(safeDistance(s, d) - safeDistance(s, p.pos)) / 10.f;
      f[PF_D_LAB] = float(int(b.labyrinthDist[d]) - int(b.labyrinthDist[p.pos])) / 10.f;
      if (!ownsRose(p) && !s.roses.empty()) f[PF_D_LAB_ROSE] = float(f[PF_D_LAB] * early);
      int region = b.spaces[d].region;
      f[PF_FOREST] = region == R_FOREST;
      f[PF_PLAINS] = region == R_PLAINS;
      f[PF_MOUNTAINS] = region == R_MOUNTAINS;
      f[PF_CEMETERY] = region == R_CEMETERY;
      double pace = std::max(1.0, expectedHandSpeed(p) * 0.7);
      double short_ = std::max(0.0, safeDistance(s, d) - pace * turnsAfter(s)) / 10;
      f[PF_HOME_SHORT] = float(short_);
      f[PF_HOME_SHORT_LATE] = float(short_ * late);
      if (b.spaces[d].effect == E_TAVERN) f[PF_TAVERN] = float(s.tavern.size()) / 3.f;
      for (int i = 0; i < b.nChests; i++)
        if (b.chests[i] == d && s.chests[i] >= 0) f[PF_CHEST] = 1;
      for (int i = 0; i < b.nCrypts; i++)
        if (b.crypts[i] == d) f[PF_CRYPT] = float(s.crypts[i].size()) / 6.f;
      int rivals = 0;
      for (int r = 0; r < s.nPlayers; r++)
        if (r != seat && s.players[r].pos == d && d != b.castle) rivals++;
      f[PF_RIVALS] = float(rivals);
      f[PF_RIVALS_LATE] = float(rivals * late);
      f[PF_SPENT] = float(spent) / 10.f;
      f[PF_SPEED_AFTER] = float(speedLeft - spent) / 10.f;
      break;
    }
    case A_HUNT: {
      const auto& pile = s.track[a.row][a.col];
      int regionBonusHere = regionBonus(s, p.pos);
      for (Card id : pile) {
        const CardDef& d = cardDef(id);
        int sp = cardSpeed(id, true);
        f[PF_VP] += d.vp / 10.f;
        if (d.type == CT_HUMAN) f[PF_REGION_VP] += regionBonusHere / 5.f;
        if (sp < 0) f[PF_NEG_SPEED] += sp / 3.f, f[PF_NEG_SPEED_LATE] += float(sp * late / 3);
        if (sp > 0 && d.type != CT_HUMAN) f[PF_POS_SPEED] += sp / 3.f, f[PF_POS_SPEED_EARLY] += float(sp * early / 3);
        f[PF_FAMILIARS] += d.type == CT_FAMILIAR;
        f[PF_POWERS] += d.type == CT_POWER;
        f[PF_PERMANENTS] += (d.kw & KW_PERMANENT) != 0;
        if (d.kw & KW_CONFUSE) f[PF_CONFUSE] += 1, f[PF_CONFUSE_EARLY] += float(early);
        f[PF_SPICY] += (d.kw & KW_SPICY) != 0;
        f[PF_HOLY_WATER] += (d.kw & KW_HOLY_WATER) != 0;
        f[PF_MISSION_FIT] += float(missionAffinity(p, id) / 5);
        f[PF_END_GAME] += d.endGame.kind != EG_NONE;
      }
      f[PF_COST] = huntCost(pile.v, pile.n, a.col) / 3.f;
      f[PF_PILE_N] = pile.size() / 5.f;
      break;
    }
    case A_HUNT_ROSE: f[PF_ROSE] = float(roseValue(s, a.card) / 10); break;
    case A_HUNT_TAVERN: f[PF_TAVERN_HUNT] = float(s.tavern.size()) / 3.f; break;
    case A_DIGEST:
      if (a.card >= 0) {
        f[PF_BADNESS] = float(discardBadness(s, a.card) / 5);
        f[PF_DIGEST_HUMAN] = cardDef(a.card).type == CT_HUMAN;
      }
      break;
    case A_RESOLVE:
    case A_USE_BONUS:
    case A_FAMILIAR:
      if (a.other >= 0) f[PF_BADNESS] = float(discardBadness(s, a.other) / 5);
      break;
    case A_KEEP_MISSIONS: {
      CtxCache cache;
      double sum = 0;
      for (int m = 0; m < NUM_MISSIONS; m++)
        if ((a.keep >> m) & 1) sum += missionEstimate(s, p, seat, m, cache);
      f[PF_MISSIONS] = float(sum / 10);
      break;
    }
    case A_INSPIRE:
      for (int i = 0; i < b.nCrypts; i++)
        if (b.crypts[i] == a.space) f[PF_INSPIRE] = float(s.crypts[i].size()) / 6.f;
      break;
    case A_READY: {
      bool good = cardSpeed(a.card, true) > 0 || hasKw(a.card, KW_PERMANENT);
      f[PF_READY_GOOD] = good == (a.spent == 0);
      break;
    }
    case A_PUSH:
      if (a.space < 0) f[PF_PUSH_NONE] = 1;
      else f[PF_PUSH_SAFE] = float(safeDistance(s, a.space) * late / 10);
      break;
    default: break;
  }
}

int policyPick(const GameState& s, int seat, const Actions& legal, const RollPolicy& pol) {
  const int L = int(legal.size());
  if (L == 1) return 0;
  int nos = heuristicPick(s, seat, legal);
  int best = 0;
  float bestV = -1e30f;
  float f[POL_FEATURES];
  for (int i = 0; i < L; i++) {
    policyFeatures(s, seat, legal[i], i == nos, f);
    float v = 0;
    for (int k = 0; k < POL_FEATURES; k++) v += pol.w[k] * f[k];
    if (v > bestV) bestV = v, best = i;
  }
  return best;
}

void policyPlayout(GameState& s, const RollPolicy& pol, bool rivals) {
  thread_local Actions legal;
  for (int i = 0; s.phase != PH_OVER && i < 5000; i++) {
    int seat = activePlayer(s);
    legalActions(s, seat, legal);
    int idx = 0;
    if (legal.size() > 1) {
      idx = rivals ? spiteRule(s, seat, legal) : -1;
      if (idx < 0) idx = policyPick(s, seat, legal, pol);
    }
    Action a = legal[idx];
    apply(s, seat, a);
  }
}

}  // namespace hg
