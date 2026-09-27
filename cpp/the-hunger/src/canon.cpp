// Canonical text + FNV-1a 64 — byte-for-byte the output of search/canon.ts.
#include <algorithm>
#include <cstdio>
#include <string>

#include "hg/engine.hpp"

namespace hg {

namespace {

static const char* const STEP_NAMES[] = {"manipulate", "move",     "push",    "act",  "digest",
                                         "missions",   "inspire", "ready", "nanny"};
static const char* const PHASE_NAMES[] = {"setup", "play", "game-over"};
static const char* const FATE_NAMES[] = {"castle", "cemetery", "mountains", "ashes"};
static const char* const BOARD_NAMES[] = {"A", "B", "test"};

struct W {
  std::string o;
  const BoardData* b;
  void raw(const char* s) { o += s; }
  void str(const char* s) {
    o += '"';
    o += s;
    o += '"';
  }
  void num(int n) { o += std::to_string(n); }
  void boolean(bool v) { o += v ? "true" : "false"; }
  void card(int c) { str(CARD_NAMES[c]); }
  void mission(int m) { str(MISSION_DEFS[m].id); }
  void space(int s) { str(b->spaces[s].id); }
  template <class V>
  void cards(const V& v) {
    o += '[';
    for (int i = 0; i < v.size(); i++) {
      if (i) o += ',';
      card(v[i]);
    }
    o += ']';
  }
  template <class V>
  void missions(const V& v) {
    o += '[';
    for (int i = 0; i < v.size(); i++) {
      if (i) o += ',';
      mission(v[i]);
    }
    o += ']';
  }
  template <class V>
  void nums(const V& v) {
    o += '[';
    for (int i = 0; i < v.size(); i++) {
      if (i) o += ',';
      num(v[i]);
    }
    o += ']';
  }
  void optNum(int n) {
    if (n < 0)
      raw("null");
    else
      num(n);
  }
};

void player(W& w, const PlayerState& p, int index) {
  w.raw("{\"index\":");
  w.num(index);
  w.raw(",\"vampire\":");
  w.num(index);
  w.raw(",\"deck\":");
  w.cards(p.deck);
  w.raw(",\"hand\":");
  w.cards(p.hand);
  w.raw(",\"playArea\":[");
  for (int i = 0; i < p.playArea.n; i++) {
    const PlayCard& c = p.playArea[i];
    if (i) w.raw(",");
    w.raw("{\"id\":");
    w.card(c.id);
    w.raw(",\"resolved\":");
    w.boolean(c.resolved);
    w.raw(",\"used\":");
    w.num(c.used);
    w.raw(",\"carried\":");
    w.boolean(c.carried);
    w.raw("}");
  }
  w.raw("],\"discard\":");
  w.cards(p.discard);
  w.raw(",\"digested\":");
  w.cards(p.digested);
  w.raw(",\"missions\":");
  w.missions(p.missions);
  w.raw(",\"usedMissions\":");
  w.missions(p.usedMissions);
  w.raw(",\"bonus\":[");
  for (int i = 0; i < p.bonus.n; i++) {
    const BonusHolding& b = p.bonus[i];
    if (i) w.raw(",");
    w.raw("{\"id\":");
    w.str(BONUS_DEFS[b.id].id);
    w.raw(",\"used\":");
    w.boolean(b.used);
    w.raw(",\"chosen\":");
    if (b.chosen < 0)
      w.raw("null");
    else
      w.str(CATEGORY_NAMES[b.chosen]);
    w.raw("}");
  }
  w.raw("],\"pos\":");
  w.space(p.pos);
  w.raw(",\"placedAt\":");
  w.num(p.placedAt);
  w.raw(",\"resting\":");
  w.boolean(p.resting);
  w.raw(",\"vp\":");
  w.num(p.vp);
  w.raw(",\"castleTile\":");
  w.optNum(p.castleTile);
  w.raw(",\"castleOrder\":");
  w.optNum(p.castleOrder);
  w.raw(",\"hunted\":");
  w.num(p.hunted);
  w.raw(",\"parasolTurnUsed\":");
  w.boolean(p.parasolTurnUsed);
  w.raw("}");
}

void turn(W& w, const TurnState& t) {
  w.raw("{\"player\":");
  w.num(t.player);
  w.raw(",\"step\":");
  w.str(STEP_NAMES[t.step]);
  w.raw(",\"stage\":");
  w.num(t.stage);
  w.raw(",\"bonusSpeed\":");
  w.num(t.bonusSpeed);
  w.raw(",\"speed\":");
  w.num(t.speed);
  w.raw(",\"speedLeft\":");
  w.num(t.speedLeft);
  w.raw(",\"moved\":");
  w.boolean(t.moved);
  w.raw(",\"spaceUsed\":");
  w.boolean(t.spaceUsed);
  w.raw(",\"hunts\":");
  w.num(t.hunts);
  w.raw(",\"extraHunts\":");
  w.num(t.extraHunts);
  w.raw(",\"col1Hunts\":");
  w.num(t.col1Hunts);
  w.raw(",\"col1Used\":");
  w.num(t.col1Used);
  w.raw(",\"huntedHumans\":[");
  for (int i = 0; i < t.huntedHumans.n; i++) {
    if (i) w.raw(",");
    w.raw("{\"category\":");
    w.str(CATEGORY_NAMES[t.huntedHumans[i].category]);
    w.raw(",\"region\":");
    w.str(REGION_NAMES[t.huntedHumans[i].region]);
    w.raw("}");
  }
  w.raw("],\"trackHunts\":[");
  for (int i = 0; i < t.trackHunts.n; i++) {
    if (i) w.raw(",");
    w.raw("{\"col\":");
    w.num(t.trackHunts[i].col);
    w.raw(",\"region\":");
    w.str(REGION_NAMES[t.trackHunts[i].region]);
    w.raw(",\"human\":");
    w.boolean(t.trackHunts[i].human);
    w.raw("}");
  }
  w.raw("],\"touched\":");
  w.boolean(t.touched);
  w.raw(",\"nannyQueue\":");
  w.nums(t.nannyQueue);
  w.raw(",\"pushQueue\":");
  w.nums(t.pushQueue);
  w.raw(",\"readyQueue\":");
  w.cards(t.readyQueue);
  w.raw(",\"missionPick\":");
  if (t.hasPick) {
    w.raw("{\"source\":");
    if (t.pickSource < 0)
      w.raw("null");
    else
      w.space(t.pickSource);
    w.raw(",\"offered\":");
    w.missions(t.pickOffered);
    w.raw(",\"keep\":");
    w.num(t.pickKeep);
    w.raw("}");
  } else {
    w.raw("null");
  }
  w.raw(",\"pendingInspire\":");
  w.num(t.pendingInspire);
  w.raw(",\"pendingDigest\":");
  w.num(t.pendingDigest);
  w.raw(",\"digestCategory\":");
  if (t.digestCategory < 0)
    w.raw("null");
  else
    w.str(CATEGORY_NAMES[t.digestCategory]);
  w.raw(",\"confused\":");
  w.boolean(t.confused);
  w.raw(",\"extraTurn\":");
  w.boolean(t.extraTurn);
  w.raw("}");
}

void result(W& w, const GameState& s) {
  const Result& r = s.result;
  int n = s.nPlayers;
  w.raw("{\"scores\":[");
  for (int i = 0; i < n; i++) {
    if (i) w.raw(",");
    w.num(r.scores[i]);
  }
  w.raw("],\"winner\":");
  w.optNum(r.winner);
  w.raw(",\"winners\":");
  w.nums(r.winners);
  w.raw(",\"placements\":[");
  for (int i = 0; i < n; i++) {
    if (i) w.raw(",");
    w.num(r.placements[i]);
  }
  w.raw("],\"breakdown\":[");
  for (int i = 0; i < n; i++) {
    const SeatBreakdown& b = r.breakdown[i];
    if (i) w.raw(",");
    w.raw("{\"duringPlay\":");
    w.num(b.duringPlay);
    w.raw(",\"cardBonuses\":");
    w.num(b.cardBonuses);
    w.raw(",\"publicMissions\":");
    w.num(b.publicMissions);
    w.raw(",\"personalMissions\":");
    w.num(b.personalMissions);
    w.raw(",\"sunrise\":");
    w.num(b.sunrise);
    w.raw(",\"fate\":");
    w.str(FATE_NAMES[b.fate]);
    w.raw(",\"total\":");
    w.num(b.total);
    w.raw(",\"missions\":[");
    for (int k = 0; k < b.missions.n; k++) {
      const MissionLine& m = b.missions[k];
      if (k) w.raw(",");
      w.raw("{\"id\":");
      w.mission(m.id);
      w.raw(",\"vp\":");
      w.num(m.vp);
      w.raw(",\"public\":");
      w.boolean(m.isPublic);
      w.raw(",\"used\":");
      w.boolean(m.used);
      w.raw("}");
    }
    w.raw("],\"cards\":[");
    for (int k = 0; k < b.cards.n; k++) {
      if (k) w.raw(",");
      w.raw("{\"card\":");
      w.card(b.cards[k].card);
      w.raw(",\"vp\":");
      w.num(b.cards[k].vp);
      w.raw("}");
    }
    w.raw("]}");
  }
  w.raw("]}");
}

}  // namespace

std::string canonicalState(const GameState& s) {
  W w;
  w.b = &boardOf(s);
  w.o.reserve(8192);
  w.raw("{\"options\":{\"mode\":");
  w.str(s.mode == MODE_ROOKIE ? "rookie" : "elder");
  w.raw(",\"board\":");
  w.str(BOARD_NAMES[s.board]);
  w.raw(",\"beginnerSafeMountains\":");
  w.boolean(s.beginnerSafeMountains);
  w.raw("},\"setupOffers\":[");
  for (int i = 0; i < s.nPlayers; i++) {
    if (i) w.raw(",");
    w.missions(s.setupOffers[i]);
  }
  w.raw("],\"rng\":");
  w.num(s.rng);
  w.raw(",\"turn\":");
  w.num(s.turn);
  w.raw(",\"phase\":");
  w.str(PHASE_NAMES[s.phase]);
  w.raw(",\"players\":[");
  for (int i = 0; i < s.nPlayers; i++) {
    if (i) w.raw(",");
    player(w, s.players[i], i);
  }
  w.raw("],\"order\":");
  w.nums(s.order);
  w.raw(",\"current\":");
  if (s.hasCurrent)
    turn(w, s.current);
  else
    w.raw("null");
  w.raw(",\"track\":[");
  for (int r = 0; r < s.nRows; r++) {
    if (r) w.raw(",");
    w.raw("[");
    for (int c = 0; c < 3; c++) {
      if (c) w.raw(",");
      w.cards(s.track[r][c]);
    }
    w.raw("]");
  }
  w.raw("],\"huntDeck\":");
  w.cards(s.huntDeck);
  w.raw(",\"tavern\":");
  w.cards(s.tavern);
  w.raw(",\"roses\":");
  w.cards(s.roses);
  const BoardData& b = *w.b;
  // Object.keys(...).sort(): the spaces' code-unit order.
  int order[MAX_CHESTS > MAX_CRYPTS ? MAX_CHESTS : MAX_CRYPTS];
  w.raw(",\"chests\":{");
  for (int i = 0; i < b.nChests; i++) order[i] = i;
  std::sort(order, order + b.nChests,
            [&](int x, int y) { return b.cuRank[b.chests[x]] < b.cuRank[b.chests[y]]; });
  for (int i = 0; i < b.nChests; i++) {
    if (i) w.raw(",");
    w.space(b.chests[order[i]]);
    w.raw(":");
    int tok = s.chests[order[i]];
    if (tok < 0)
      w.raw("null");
    else
      w.str(BONUS_DEFS[tok].id);
  }
  w.raw("},\"crypts\":{");
  for (int i = 0; i < b.nCrypts; i++) order[i] = i;
  std::sort(order, order + b.nCrypts,
            [&](int x, int y) { return b.cuRank[b.crypts[x]] < b.cuRank[b.crypts[y]]; });
  for (int i = 0; i < b.nCrypts; i++) {
    if (i) w.raw(",");
    w.space(b.crypts[order[i]]);
    w.raw(":");
    w.missions(s.crypts[order[i]]);
  }
  w.raw("},\"publicMissions\":");
  w.missions(s.publicMissions);
  w.raw(",\"castleTiles\":");
  w.nums(s.castleTiles);
  w.raw(",\"castleArrivals\":");
  w.num(s.castleArrivals);
  w.raw(",\"placeCounter\":");
  w.num(s.placeCounter);
  w.raw(",\"result\":");
  if (s.hasResult)
    result(w, s);
  else
    w.raw("null");
  w.raw("}");
  return std::move(w.o);
}

uint64_t fnv1a64(const std::string& text) {
  uint64_t h = 0xcbf29ce484222325ull;
  for (unsigned char c : text) {
    h ^= c;
    h *= 0x100000001b3ull;
  }
  return h;
}

std::string hex64(uint64_t h) {
  char buf[17];
  std::snprintf(buf, sizeof buf, "%016llx", (unsigned long long)h);
  return buf;
}

std::string canonicalAction(const GameState& s, const Action& a) {
  const BoardData& b = boardOf(s);
  auto card = [](int c) -> std::string { return c < 0 ? "~" : CARD_NAMES[c]; };
  auto sp = [&](int x) -> std::string { return x < 0 ? "~" : b.spaces[x].id; };
  auto n = [](int x) -> std::string { return x < 0 ? "~" : std::to_string(x); };
  switch (a.type) {
    case A_RESOLVE: return "resolve " + card(a.card) + " " + card(a.other);
    case A_USE_BONUS: return std::string("use-bonus ") + BONUS_DEFS[a.token].id + " " + card(a.other);
    case A_END_MANIPULATION: return "end-manipulation";
    case A_MOVE: return "move " + sp(a.space) + " " + std::to_string(a.spent);
    case A_MIST: return "mist " + sp(a.space);
    case A_STAY: return "stay";
    case A_PUSH: return "push " + sp(a.space);
    case A_SPACE: return "space";
    case A_DIGEST: return "digest " + card(a.card);
    case A_KEEP_MISSIONS: {
      std::string out = "keep-missions ";
      bool first = true;
      for (int m = 0; m < NUM_MISSIONS; m++)
        if ((a.keep >> m) & 1) {
          if (!first) out += ",";
          out += MISSION_DEFS[m].id;
          first = false;
        }
      return out;
    }
    case A_INSPIRE: return "inspire " + sp(a.space);
    case A_HUNT: return "hunt " + std::to_string(a.row) + " " + std::to_string(a.col);
    case A_HUNT_TAVERN: return "hunt-tavern";
    case A_HUNT_ROSE: return "hunt-rose " + card(a.card);
    case A_READY: return "ready " + card(a.card) + (a.spent == 0 ? " deck" : " discard");
    case A_INSTANT:
      return std::string("instant ") + MISSION_DEFS[a.mission].id + " " + n(a.row) + " " +
             n(a.col) + " " + card(a.card) + " " + sp(a.space);
    case A_FAMILIAR: return "familiar " + card(a.card) + " " + card(a.other);
    case A_HYPNOSIS:
      return "hypnosis " + card(a.card) + " " + card(a.other) + " " + std::to_string(a.row) + " " +
             std::to_string(a.col);
    case A_DISCARD_PERMANENT: return "discard-permanent " + card(a.card);
    case A_END_TURN: return "end-turn";
  }
  return "?";
}

}  // namespace hg
