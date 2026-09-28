// State transitions — a port of game-engine.ts. `apply` is applyInPlace: one
// legal action plus every automatic follow-up (settle, end of turn, the next
// Vampire, upkeep, the Parasol turn, sunrise) until someone must decide.
#include <algorithm>
#include <cmath>
#include <cstring>

#include "hg/engine.hpp"

namespace hg {

static const int8_t CASTLE_TILES[7][5] = {
    {0}, {0}, {10, 6}, {10, 6, 4}, {10, 8, 6, 4}, {10, 8, 6, 4, 2}, {10, 8, 6, 4, 2},
};
static const int CASTLE_TILE_COUNT[7] = {0, 0, 2, 3, 4, 5, 5};

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

double random(GameState& s) {
  s.rng = int32_t(uint32_t(s.rng) + 0x6d2b79f5u);
  uint32_t a = uint32_t(s.rng);
  uint32_t t = (a ^ (a >> 15)) * (1u | a);
  t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
  return double(t ^ (t >> 14)) / 4294967296.0;
}

template <class T>
static void shuffleState(GameState& s, T* arr, int n) {
  for (int i = n - 1; i > 0; i--) {
    int j = int(std::floor(random(s) * double(i + 1)));
    std::swap(arr[i], arr[j]);
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

static int drawOne(GameState& s, PlayerState& p) {
  if (p.deck.empty()) {
    if (p.discard.empty()) return -1;
    p.deck = {};
    for (Card c : p.discard) p.deck.push(c);
    shuffleState(s, p.deck.v, p.deck.n);
    p.discard.clear();
  }
  if (p.deck.empty()) return -1;
  return p.deck.pop();
}

static void drawCards(GameState& s, PlayerState& p, int count) {
  for (int i = 0; i < count; i++) {
    int card = drawOne(s, p);
    if (card >= 0) p.hand.push(Card(card));
  }
}

static int drawToPlay(GameState& s, PlayerState& p) {
  int card = drawOne(s, p);
  if (card >= 0) p.playArea.push(PlayCard{Card(card), false, 0, false});
  return card;
}

static int findPlay(const PlayerState& p, int id) {
  for (int i = 0; i < p.playArea.n; i++)
    if (p.playArea[i].id == id) return i;
  return -1;
}

static void removeFromPlay(PlayerState& p, int id) {
  int i = findPlay(p, id);
  if (i < 0) fail("card is not in the playing area");
  p.playArea.erase(i);
}

static void refillTrack(GameState& s) {
  for (int r = 0; r < s.nRows; r++) {
    if (s.huntDeck.empty()) return;
    Card card = s.huntDeck.pop();
    s.track[r][hasKw(card, KW_SLOW) ? 1 : 2].push(card);
  }
}

static int chestSlot(const BoardData& b, int space) {
  for (int i = 0; i < b.nChests; i++)
    if (b.chests[i] == space) return i;
  return -1;
}
static int cryptSlot(const BoardData& b, int space) {
  for (int i = 0; i < b.nCrypts; i++)
    if (b.crypts[i] == space) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// Rounds and turns
// ---------------------------------------------------------------------------

static void freshTurn(TurnState& t, int player) {
  std::memset(static_cast<void*>(&t), 0, sizeof t);
  t.player = int8_t(player);
  t.step = ST_MANIPULATE;
  t.stage = 1;
  t.pickSource = -1;
  t.digestCategory = -1;
}

static void orderKey(const GameState& s, int space, int key[3]) {
  const BoardData& b = boardOf(s);
  if (space == b.labyrinth) {
    key[0] = -1;
    key[1] = -1;
    key[2] = 0;
    return;
  }
  static const int REGION_RANK[5] = {4, 3, 2, 1, 0};  // castle, cemetery, mountains, plains, forest
  const Space& sp = b.spaces[space];
  key[0] = REGION_RANK[sp.region];
  key[1] = sp.path >= 0 ? sp.path : 3;
  key[2] = b.labyrinthDist[space];
}

static void turnOrder(const GameState& s, int8_t* seats, int n) {
  std::stable_sort(seats, seats + n, [&](int8_t a, int8_t b) {
    int ka[3], kb[3];
    orderKey(s, s.players[a].pos, ka);
    orderKey(s, s.players[b].pos, kb);
    for (int i = 0; i < 3; i++)
      if (ka[i] != kb[i]) return ka[i] < kb[i];
    return s.players[b].placedAt < s.players[a].placedAt;
  });
}

static void nextTurn(GameState& s);
static void endTurn(GameState& s);
static void settle(GameState& s);

static void beginRound(GameState& s) {
  int8_t seats[MAX_PLAYERS];
  for (int i = 0; i < s.nPlayers; i++) seats[i] = int8_t(i);
  turnOrder(s, seats, s.nPlayers);
  s.order.clear();
  for (int i = 0; i < s.nPlayers; i++) s.order.push(seats[i]);
  nextTurn(s);
}

static void beginSetupPick(GameState& s) {
  int seat = -1;
  for (int i = 0; i < s.nPlayers; i++)
    if (!s.setupOffers[i].empty()) {
      seat = i;
      break;
    }
  if (seat < 0) {
    s.phase = PH_PLAY;
    beginRound(s);
    return;
  }
  s.hasCurrent = true;
  freshTurn(s.current, seat);
  s.current.step = ST_MISSIONS;
  s.current.hasPick = true;
  s.current.pickSource = -1;
  for (uint8_t m : s.setupOffers[seat]) s.current.pickOffered.push(m);
  s.current.pickKeep = 1;
}

static void enterMove(GameState& s);

static void settleManipulation(GameState& s) {
  if (!s.hasCurrent || s.current.step != ST_MANIPULATE) return;
  thread_local Actions legal;
  legalActions(s, s.current.player, legal);
  if (legal.size() == 1 && legal[0].type == A_END_MANIPULATION) enterMove(s);
}

static void startTurn(GameState& s, int seat) {
  PlayerState& p = s.players[seat];
  s.hasCurrent = true;
  freshTurn(s.current, seat);
  s.current.extraTurn = s.turn > TURNS;
  for (PlayCard& c : p.playArea) {
    c.resolved = false;
    c.used = 0;
  }
  for (Card id : p.hand) p.playArea.push(PlayCard{id, false, 0, false});
  p.hand.clear();
  if (isReturned(p)) {
    endTurn(s);
    return;
  }
  settleManipulation(s);
}

static void onArrive(GameState& s) {
  if (!s.hasCurrent) return;
  TurnState& t = s.current;
  PlayerState& p = s.players[t.player];
  if (isWell(graphOf(s), p.pos) && t.speed > 0) {
    t.col1Hunts += 1;
    int bonus = 0;
    for (const PlayCard& c : p.playArea) {
      const CardDef& d = cardDef(c.id);
      for (int k = 0; k < d.nPassives; k++)
        if (d.passives[k].kind == PK_WELL_SPEED) bonus += d.passives[k].n;
    }
    t.speedLeft += bonus;
  }
  settle(s);
}

static void enterMove(GameState& s) {
  if (!s.hasCurrent) return;
  TurnState& t = s.current;
  PlayerState& p = s.players[t.player];
  const Graph& g = graphOf(s);
  if (hasKeyword(p, KW_CONFUSE) && !isReturned(p)) {
    int to = confuseDestination(g, p.pos);
    if (to != p.pos) {
      p.pos = int16_t(to);
      p.placedAt = ++s.placeCounter;
      t.confused = true;
    }
  }
  t.stage = 2;
  t.speed = int16_t(playAreaSpeed(p) + t.bonusSpeed);
  int lockjaw = humansBonusVp(p);
  if (lockjaw > 0) p.vp += lockjaw;
  t.speedLeft = int16_t(std::max(0, int(t.speed)));
  t.extraHunts += passiveCount(p, PK_EXTRA_HUNT);
  t.step = (t.speed > 0 && !isReturned(p)) ? ST_MOVE : ST_ACT;
  if (t.step == ST_ACT) onArrive(s);
}

static bool hasMissionStack(const GameState& s) {
  const BoardData& b = boardOf(s);
  for (int i = 0; i < b.nCrypts; i++)
    if (!s.crypts[i].empty()) return true;
  return false;
}

static bool anyDigestible(const PlayerState& p) { return !p.playArea.empty() || !p.discard.empty(); }

static void settle(GameState& s) {
  if (!s.hasCurrent) return;
  TurnState& t = s.current;
  PlayerState& p = s.players[t.player];
  if (!t.nannyQueue.empty())
    t.step = ST_NANNY;
  else if (!t.pushQueue.empty())
    t.step = ST_PUSH;
  else if (!t.readyQueue.empty())
    t.step = ST_READY;
  else if (t.pendingDigest > 0 && anyDigestible(p))
    t.step = ST_DIGEST;
  else if (t.hasPick)
    t.step = ST_MISSIONS;
  else if (t.pendingInspire > 0 && hasMissionStack(s))
    t.step = ST_INSPIRE;
  else {
    t.pendingInspire = 0;
    if (t.stage == 1) {
      t.step = ST_MANIPULATE;
      settleManipulation(s);
    } else {
      t.step = ST_ACT;
    }
  }
}

static void arriveCastle(GameState& s, PlayerState& p) {
  if (isReturned(p) || p.pos != boardOf(s).castle) return;
  int tile = s.castleTiles.empty() ? 0 : s.castleTiles.shift();
  p.castleTile = int8_t(tile);
  p.castleOrder = ++s.castleArrivals;
  p.vp += tile;
}

static void endTurn(GameState& s) {
  if (!s.hasCurrent) return;
  TurnState& t = s.current;
  PlayerState& p = s.players[t.player];
  p.resting = true;
  bool carrySpicy = !isWell(graphOf(s), p.pos);
  int endVp = 0;
  Vec<PlayCard, CAP_PLAY> keep;
  bool hunted = t.hunts > 0;
  for (const PlayCard& card : p.playArea) {
    const CardDef& d = cardDef(card.id);
    for (int k = 0; k < d.nPassives; k++) {
      const Passive& e = d.passives[k];
      if (e.kind == PK_END_TURN_VP) {
        if (e.when == W_ALWAYS || (e.when == W_HUNTED && hunted) ||
            (e.when == W_NOT_HUNTED && !hunted))
          endVp += e.n;
      }
      if (e.kind == PK_HUMAN_HUNT_VP && !t.huntedHumans.empty()) endVp += e.n;
    }
    if (d.kw & KW_SPICY) {
      if (carrySpicy)
        keep.push(PlayCard{card.id, false, 0, true});
      else
        p.discard.push(card.id);
    } else if (d.kw & KW_PERMANENT) {
      keep.push(PlayCard{card.id, false, 0, false});
    } else {
      p.discard.push(card.id);
    }
  }
  p.playArea = keep;
  p.vp += endVp;
  drawCards(s, p, 3);
  if (t.extraTurn) p.parasolTurnUsed = true;
  s.hasCurrent = false;
  nextTurn(s);
}

static void finishGame(GameState& s) {
  s.hasCurrent = false;
  s.order.clear();
  s.phase = PH_OVER;
  computeResult(s);
}

static void prepareNextTurn(GameState& s) {
  if (s.turn >= TURNS) {
    if (s.turn == TURNS) {
      int8_t parasols[MAX_PLAYERS];
      int n = 0;
      for (int i = 0; i < s.nPlayers; i++) {
        const PlayerState& p = s.players[i];
        if (isReturned(p) || p.parasolTurnUsed) continue;
        bool has = false;
        for (const BonusHolding& b : p.bonus)
          if (BONUS_DEFS[b.id].kind == BK_PARASOL) has = true;
        if (has) parasols[n++] = int8_t(i);
      }
      if (n > 0) {
        s.turn = TURNS + 1;
        for (int i = 0; i < s.nPlayers; i++) s.players[i].resting = false;
        turnOrder(s, parasols, n);
        s.order.clear();
        for (int i = 0; i < n; i++) s.order.push(parasols[i]);
        nextTurn(s);
        return;
      }
    }
    finishGame(s);
    return;
  }
  s.turn += 1;
  for (int i = 0; i < s.nPlayers; i++) s.players[i].resting = false;
  for (int r = 0; r < s.nRows; r++) {
    auto* row = s.track[r];
    for (Card c : row[1]) row[0].push(c);
    row[1] = row[2];
    row[2].clear();
  }
  if (s.turn < TURNS) refillTrack(s);
  const BoardData& b = boardOf(s);
  bool tavernBusy = false;
  for (int i = 0; i < s.nPlayers; i++)
    if (b.tavern >= 0 && s.players[i].pos == b.tavern) tavernBusy = true;
  if (!tavernBusy && s.tavern.size() < 3) {
    if (!s.huntDeck.empty()) s.tavern.push(s.huntDeck.pop());
  }
  beginRound(s);
}

static void nextTurn(GameState& s) {
  if (s.order.empty()) {
    prepareNextTurn(s);
    return;
  }
  int seat = s.order.shift();
  startTurn(s, seat);
}

// ---------------------------------------------------------------------------
// Hunting
// ---------------------------------------------------------------------------

static int scoreCard(GameState& s, PlayerState& p, TurnState& t, int card) {
  const CardDef& d = cardDef(card);
  int vp = d.vp;
  if (d.type == CT_HUMAN && d.category >= 0) {
    int region = spaceOf(s, p.pos).region;
    if (region == R_PLAINS) vp += 1;
    if (region == R_FOREST) vp += 2;
    for (const PlayCard& c : p.playArea) {
      const CardDef& cd = cardDef(c.id);
      for (int k = 0; k < cd.nPassives; k++)
        if (cd.passives[k].kind == PK_HUNT_VP_PER_HUMAN) vp += cd.passives[k].n;
    }
    if (d.huntBonusRegion >= 0 && d.huntBonusRegion == region) vp += d.huntBonusVp;
    t.huntedHumans.push(HuntedHuman{d.category, int8_t(region)});
  }
  return vp;
}

static void gain(PlayerState& p, TurnState& t, int card) {
  const CardDef& d = cardDef(card);
  p.hunted += 1;
  if (d.kw & KW_READY)
    t.readyQueue.push(Card(card));
  else
    p.discard.push(Card(card));
  if (d.kw & KW_INSPIRING) t.pendingInspire += 1;
  if (d.onHuntDigest) t.pendingDigest += 1;
}

enum Source { SRC_TRACK, SRC_TAVERN, SRC_ROSE };

static void huntCards(GameState& s, Source source, const Card* cards, int n, int col) {
  if (!s.hasCurrent) return;
  TurnState& t = s.current;
  PlayerState& p = s.players[t.player];
  int vp = 0;
  for (int i = 0; i < n; i++) {
    int card = cards[i];
    vp += scoreCard(s, p, t, card);
    gain(p, t, card);
    if (hasKw(card, KW_GREGARIOUS)) {
      if (!s.huntDeck.empty()) {
        int extra = s.huntDeck.pop();
        vp += scoreCard(s, p, t, extra);
        gain(p, t, extra);
      }
    }
  }
  p.vp += vp;
  if (source == SRC_TRACK && col >= 0) {
    bool human = false;
    for (int i = 0; i < n; i++)
      if (cardDef(cards[i]).type == CT_HUMAN) human = true;
    t.trackHunts.push(TrackHunt{int8_t(col - 1), spaceOf(s, p.pos).region, human});
  }
}

static void afterHunt(GameState& s, TurnState& t, int cost, bool col1) {
  t.hunts += 1;
  if (col1) t.col1Used += 1;
  t.speedLeft -= cost;
  HuntsLeft left = huntsLeft(t);
  if (left.general + left.col1 == 0) t.speedLeft = 0;
  settle(s);
}

static void takeBonus(GameState& s, PlayerState& p, int space) {
  const BoardData& b = boardOf(s);
  int slot = chestSlot(b, space);
  if (slot < 0 || s.chests[slot] < 0) fail("Empty chest");
  int token = s.chests[slot];
  s.chests[slot] = -1;
  p.bonus.push(BonusHolding{uint8_t(token), false, -1});
  p.vp += BONUS_DEFS[token].kind == BK_VELVET ? 4 : 2;
}

static void openCrypt(GameState& s, PlayerState& p, TurnState& t, int crypt) {
  int slot = cryptSlot(boardOf(s), crypt);
  if (slot < 0 || s.crypts[slot].empty()) return;
  t.hasPick = true;
  t.pickSource = int16_t(crypt);
  t.pickOffered.clear();
  for (uint8_t m : s.crypts[slot]) t.pickOffered.push(m);
  s.crypts[slot].clear();
  t.pickKeep = int8_t(s.mode == MODE_ROOKIE ? 1 : p.missions.size() + 1);
}

static void nannyTax(GameState& s, PlayerState& p, TurnState& t, PlayerState& victim, int victimIdx) {
  int nannies = 0, vp = 0;
  for (const PlayCard& c : p.playArea) {
    const CardDef& d = cardDef(c.id);
    for (int k = 0; k < d.nPassives; k++)
      if (d.passives[k].kind == PK_PUSH_TAX) {
        nannies++;
        vp += d.passives[k].vp;
      }
  }
  if (nannies == 0) return;
  p.vp += vp;
  int permanents = 0, first = -1;
  for (const PlayCard& c : victim.playArea)
    if (hasKw(c.id, KW_PERMANENT)) {
      if (first < 0) first = c.id;
      permanents++;
    }
  if (permanents == 1) {
    removeFromPlay(victim, first);
    victim.discard.push(Card(first));
  } else if (permanents > 1) {
    t.nannyQueue.push(int8_t(victimIdx));
  }
  (void)s;
}

static void applyFamiliar(GameState& s, PlayerState& p, TurnState& t, const Action& a) {
  const CardDef& d = cardDef(a.card);
  int vp = 0;
  switch (d.act.kind) {
    case AK_DISCARD_FOR_COL1_HUNT:
      removeFromPlay(p, a.card);
      p.discard.push(Card(a.card));
      t.col1Hunts += 1;
      break;
    case AK_DIGEST_WITH_CARD:
      if (a.other < 0) fail("Wiggles needs a card");
      removeFromPlay(p, a.card);
      removeFromPlay(p, a.other);
      p.digested.push(Card(a.card));
      p.digested.push(Card(a.other));
      vp = d.act.vp;
      break;
    case AK_REDRAW_HAND: {
      Vec<PlayCard, CAP_PLAY> keep;
      for (const PlayCard& card : p.playArea) {
        if (card.id == a.card) continue;
        if (hasKw(card.id, KW_PERMANENT) || card.carried)
          keep.push(card);
        else
          p.discard.push(card.id);
      }
      p.playArea = keep;
      p.discard.push(Card(a.card));
      for (int i = 0; i < d.act.draw; i++) drawToPlay(s, p);
      vp = d.act.vp;
      break;
    }
    default: fail("This card has no ability");
  }
  t.touched = true;
  p.vp += vp;
  settle(s);
}

static void removeFromTrack(GameState& s, int card) {
  for (int r = 0; r < s.nRows; r++)
    for (int c = 0; c < 3; c++) s.track[r][c].removeAll(Card(card));
}

static void applyInstant(GameState& s, PlayerState& p, TurnState& t, const Action& a, int player) {
  const MissionDef& m = MISSION_DEFS[a.mission];
  p.missions.removeAll(uint8_t(a.mission));
  p.usedMissions.push(uint8_t(a.mission));
  switch (m.instant) {
    case IK_VP_PER_CLOSER: p.vp += closerCount(s, player); break;
    case IK_TAKE_BONUS:
      if (a.space >= 0) takeBonus(s, p, a.space);
      break;
    case IK_FREE_FAMILIAR: {
      if (a.card < 0) fail("Beast Master needs a Familiar");
      removeFromTrack(s, a.card);
      p.hunted += 1;
      p.vp += cardDef(a.card).vp;
      int before = playAreaSpeed(p);
      p.playArea.push(PlayCard{Card(a.card), false, 0, false});
      if (t.stage == 2) {
        int add = playAreaSpeed(p) - before;
        t.speed += add;
        t.speedLeft = int16_t(std::max(0, t.speedLeft + add));
      }
      break;
    }
    case IK_FREE_HUNT_AFTER_COL3:
    case IK_FREE_HUNT_SAME_COLUMN: {
      if (a.row < 0 || a.col < 0) fail("No pile");
      Vec<Card, CAP_PILE> pile = s.track[a.row][a.col];
      s.track[a.row][a.col].clear();
      huntCards(s, SRC_TRACK, pile.v, pile.n, a.col + 1);
      break;
    }
    case IK_DIGEST_HAND: {
      Vec<PlayCard, CAP_PLAY> keep;
      for (const PlayCard& card : p.playArea) {
        const CardDef& d = cardDef(card.id);
        if ((d.kw & KW_PERMANENT) || card.carried)
          keep.push(card);
        else if (d.type == CT_HUMAN)
          p.digested.push(card.id);
        else
          p.discard.push(card.id);
      }
      p.playArea = keep;
      endTurn(s);
      return;
    }
    default: fail("Not an Instant Mission");
  }
  settle(s);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

void apply(GameState& s, int player, const Action& a) {
  if (!s.hasCurrent) fail("No turn in progress");
  TurnState& t = s.current;
  PlayerState& p = s.players[player];
  const Graph& g = graphOf(s);
  const BoardData& b = *g.b;

  switch (a.type) {
    case A_RESOLVE: {
      int i = findPlay(p, a.card);
      const Manipulation& m = cardDef(a.card).manip;
      if (i < 0 || m.kind == MK_NONE) fail("Nothing to resolve");
      bool human = hasHuman(p);
      p.playArea[i].resolved = true;
      p.playArea[i].used += 1;
      t.touched = true;
      if (m.kind == MK_DRAW) {
        int n = a.spent >= 0 ? a.spent : human ? (m.withHuman >= 0 ? m.withHuman : m.n) : m.n;
        for (int k = 0; k < n; k++) drawToPlay(s, p);
      } else if (a.other >= 0) {
        removeFromPlay(p, a.other);
        p.discard.push(Card(a.other));
        drawToPlay(s, p);
      }
      settleManipulation(s);
      return;
    }
    case A_USE_BONUS: {
      BonusHolding* token = nullptr;
      for (BonusHolding& h : p.bonus)
        if (h.id == a.token && !h.used) {
          token = &h;
          break;
        }
      if (!token) fail("No such token");
      token->used = true;
      t.touched = true;
      const BonusDef& bd = BONUS_DEFS[token->id];
      if (t.stage == 2 && bd.kind != BK_MISSION) {
        // Speed already counted: change it in place, stay on the step
        // (TS RULINGS.bonusTokensAnytime).
        if (bd.kind == BK_SPEED) {
          t.speed += bd.n;
          t.speedLeft += bd.n;
        } else if (bd.kind == BK_EXTRA_HUNT) {
          t.extraHunts += 1;
        } else if (bd.kind == BK_DRAW_TO_PLAY || bd.kind == BK_DISCARD_DRAW) {
          int before = playAreaSpeed(p);
          if (bd.kind == BK_DISCARD_DRAW && a.other >= 0) {
            removeFromPlay(p, a.other);
            p.discard.push(Card(a.other));
          }
          drawToPlay(s, p);
          int delta = playAreaSpeed(p) - before;
          t.speed += delta;
          t.speedLeft = std::max(0, t.speedLeft + delta);
        }
        return;
      }
      if (bd.kind == BK_SPEED)
        t.bonusSpeed += bd.n;
      else if (bd.kind == BK_EXTRA_HUNT)
        t.extraHunts += 1;
      else if (bd.kind == BK_DRAW_TO_PLAY)
        drawToPlay(s, p);
      else if (bd.kind == BK_DISCARD_DRAW && a.other >= 0) {
        removeFromPlay(p, a.other);
        p.discard.push(Card(a.other));
        drawToPlay(s, p);
      } else if (bd.kind == BK_MISSION)
        t.pendingInspire += 1;
      settle(s);
      return;
    }
    case A_END_MANIPULATION: enterMove(s); return;
    case A_MOVE:
    case A_MIST: {
      int spent = a.type == A_MOVE ? a.spent : 0;
      p.pos = a.space;
      p.placedAt = ++s.placeCounter;
      t.moved = true;
      t.speedLeft -= spent;
      arriveCastle(s, p);
      const Space& landed = b.spaces[p.pos];
      if (landed.effect != E_CASTLE && landed.region != R_CEMETERY) {
        int8_t others[MAX_PLAYERS];
        int n = 0;
        for (int i = 0; i < s.nPlayers; i++)
          if (i != player && s.players[i].pos == p.pos) others[n++] = int8_t(i);
        std::stable_sort(others, others + n, [&](int8_t x, int8_t y) {
          return s.players[y].placedAt < s.players[x].placedAt;
        });
        t.pushQueue.clear();
        for (int i = 0; i < n; i++) t.pushQueue.push(others[i]);
        int16_t to[MAX_SPACES];
        if (pushDestinations(g, p.pos, to) == 0) t.pushQueue.clear();
      }
      t.step = ST_ACT;
      onArrive(s);
      return;
    }
    case A_STAY:
      t.extraHunts += passiveCount(p, PK_STAY_EXTRA_HUNT);
      t.step = ST_ACT;
      onArrive(s);
      return;
    case A_PUSH: {
      if (t.pushQueue.empty()) fail("Nobody to push");
      int victim = t.pushQueue.shift();
      if (a.space >= 0) {
        PlayerState& v = s.players[victim];
        v.pos = a.space;
        v.placedAt = ++s.placeCounter;
        nannyTax(s, p, t, v, victim);
      }
      settle(s);
      return;
    }
    case A_DISCARD_PERMANENT:
      if (!t.nannyQueue.empty()) t.nannyQueue.shift();
      removeFromPlay(p, a.card);
      p.discard.push(Card(a.card));
      settle(s);
      return;
    case A_FAMILIAR: applyFamiliar(s, p, t, a); return;
    case A_HYPNOSIS: {
      int i = findPlay(p, a.card);
      if (i < 0) fail("No Hypnosis in play");
      p.playArea[i].resolved = true;
      t.touched = true;
      removeFromTrack(s, a.other);
      s.track[a.row][a.col].push(Card(a.other));
      settle(s);
      return;
    }
    case A_SPACE: {
      const Space& here = b.spaces[p.pos];
      t.spaceUsed = true;
      if (here.effect == E_CHEST || here.effect == E_CHEST_OPEN) {
        takeBonus(s, p, p.pos);
      } else if (here.effect == E_CRYPT) {
        openCrypt(s, p, t, p.pos);
      } else {
        int category = digestCategoryOf(here.effect);
        if (category < 0) fail("This space has no effect");
        t.digestCategory = int8_t(category);
        t.step = ST_DIGEST;
        return;
      }
      settle(s);
      return;
    }
    case A_DIGEST: {
      if (a.card >= 0) {
        int i = findPlay(p, a.card);
        if (i >= 0)
          p.playArea.erase(i);
        else {
          int j = p.discard.indexOf(Card(a.card));
          p.discard.erase(j >= 0 ? j : p.discard.n - 1);
        }
        p.digested.push(Card(a.card));
      }
      if (t.digestCategory >= 0)
        t.digestCategory = -1;
      else
        t.pendingDigest = int8_t(std::max(0, t.pendingDigest - 1));
      settle(s);
      return;
    }
    case A_INSPIRE:
      t.pendingInspire = int8_t(std::max(0, t.pendingInspire - 1));
      openCrypt(s, p, t, a.space);
      settle(s);
      return;
    case A_KEEP_MISSIONS: {
      if (!t.hasPick) fail("No missions to keep");
      uint8_t kept[64];
      int nk = 0;
      for (int m = 0; m < NUM_MISSIONS; m++)
        if ((a.keep >> m) & 1) kept[nk++] = uint8_t(m);
      if (t.pickSource < 0) {
        p.missions.clear();
        for (int i = 0; i < nk; i++) p.missions.push(kept[i]);
        s.setupOffers[player].clear();
        s.hasCurrent = false;
        beginSetupPick(s);
        return;
      }
      int gained = 0;
      for (int i = 0; i < nk; i++)
        if (!p.missions.contains(kept[i])) gained++;
      int sova = 0;
      for (const PlayCard& c : p.playArea) {
        const CardDef& d = cardDef(c.id);
        for (int k = 0; k < d.nPassives; k++)
          if (d.passives[k].kind == PK_VP_PER_MISSION) sova += d.passives[k].n;
      }
      if (gained > 0 && sova > 0) p.vp += gained * sova;
      int slot = cryptSlot(b, t.pickSource);
      auto isKept = [&](uint8_t m) { return (a.keep >> m) & 1; };
      if (s.mode == MODE_ROOKIE) {
        for (int i = 0; i < nk; i++) p.missions.push(kept[i]);
        s.crypts[slot].clear();
        for (uint8_t m : t.pickOffered)
          if (!isKept(m)) s.crypts[slot].push(m);
      } else {
        Vec<uint8_t, CAP_CRYPT> returned;
        for (uint8_t m : p.missions)
          if (!isKept(m)) returned.push(m);
        for (uint8_t m : t.pickOffered)
          if (!isKept(m)) returned.push(m);
        p.missions.clear();
        for (int i = 0; i < nk; i++) p.missions.push(kept[i]);
        s.crypts[slot] = returned;
      }
      t.hasPick = false;
      t.pickSource = -1;
      t.pickOffered.clear();
      t.pickKeep = 0;
      settle(s);
      return;
    }
    case A_HUNT: {
      Vec<Card, CAP_PILE> pile = s.track[a.row][a.col];
      int cost = huntCost(pile.v, pile.n, a.col);
      HuntsLeft left = huntsLeft(t);
      bool col1 = a.col == 0 && left.col1 > 0;
      s.track[a.row][a.col].clear();
      huntCards(s, SRC_TRACK, pile.v, pile.n, a.col + 1);
      afterHunt(s, t, cost, col1);
      return;
    }
    case A_HUNT_TAVERN: {
      Vec<Card, CAP_TAVERN> cards = s.tavern;
      s.tavern.clear();
      t.spaceUsed = true;
      huntCards(s, SRC_TAVERN, cards.v, cards.n, -1);
      afterHunt(s, t, 2, false);
      return;
    }
    case A_HUNT_ROSE: {
      s.roses.removeAll(Card(a.card));
      t.spaceUsed = true;
      Card c = Card(a.card);
      huntCards(s, SRC_ROSE, &c, 1, -1);
      afterHunt(s, t, 0, false);
      return;
    }
    case A_READY: {
      if (t.readyQueue.empty()) fail("Not the pending Ready card");
      Card card = t.readyQueue.shift();
      if (card != a.card) fail("Not the pending Ready card");
      if (a.spent == 0)
        p.deck.push(card);
      else
        p.discard.push(card);
      settle(s);
      return;
    }
    case A_INSTANT: applyInstant(s, p, t, a, player); return;
    case A_END_TURN: endTurn(s); return;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

static int handSpeed(const PlayerState& p) {
  bool human = false;
  for (Card c : p.hand)
    if (cardDef(c).type == CT_HUMAN) human = true;
  int sum = 0;
  for (Card c : p.hand) sum += cardSpeed(c, human);
  return sum;
}

GameState createInitialState(int n, uint32_t seed, Mode mode, bool safe, int board) {
  if (n < 2 || n > MAX_PLAYERS) fail("The Hunger seats 2-6");
  GameState s;
  std::memset(static_cast<void*>(&s), 0, sizeof s);
  s.rng = int32_t(seed);
  s.mode = mode;
  s.board = int8_t(board >= 0 ? board : (mode == MODE_ROOKIE ? BOARD_A : BOARD_B));
  s.beginnerSafeMountains = safe;
  s.nPlayers = int8_t(n);
  s.turn = 1;
  s.phase = PH_SETUP;
  for (int i = 0; i < NUM_ROSES; i++) s.roses.push(ROSE_EXPAND[i]);
  for (int i = 0; i < CASTLE_TILE_COUNT[n]; i++) s.castleTiles.push(CASTLE_TILES[n][i]);
  const BoardData& b = boardOf(s);

  // Hunt deck. The END is the top.
  if (mode == MODE_ROOKIE) {
    Card rookie[NUM_ROOKIE_A];
    std::memcpy(rookie, ROOKIE_A, sizeof rookie);
    shuffleState(s, rookie, NUM_ROOKIE_A);
    int asideN = std::min(NUM_ROOKIE_A, 2 + 2 * n);
    Card rest[NUM_HUNT];
    int nr = 0;
    for (int i = asideN; i < NUM_ROOKIE_A; i++) rest[nr++] = rookie[i];
    for (int i = 0; i < NUM_ROOKIE_REST; i++) rest[nr++] = ROOKIE_REST[i];
    shuffleState(s, rest, nr);
    for (int i = 0; i < nr; i++) s.huntDeck.push(rest[i]);
    for (int i = 0; i < asideN; i++) s.huntDeck.push(rookie[i]);
  } else {
    for (int i = 0; i < NUM_HUNT; i++) s.huntDeck.push(HUNT_EXPAND[i]);
    shuffleState(s, s.huntDeck.v, s.huntDeck.n);
  }

  // Chests.
  uint8_t tokens[NUM_BONUS];
  std::memcpy(tokens, BONUS_EXPAND, sizeof tokens);
  shuffleState(s, tokens, NUM_BONUS);
  int nt = NUM_BONUS;
  for (int i = 0; i < b.nChests; i++) s.chests[i] = int8_t(nt > 0 ? tokens[--nt] : -1);

  // Tavern.
  for (int i = 0; i < 3; i++) {
    if (s.huntDeck.empty()) continue;
    Card c = mode == MODE_ROOKIE ? s.huntDeck.shift() : s.huntDeck.pop();
    s.tavern.push(c);
  }

  // Missions.
  uint8_t pool[NUM_MISSIONS];
  int np = 0;
  for (int i = 0; i < NUM_MISSIONS; i++) {
    int m = MISSION_ORDER[i];
    if (n >= 5 || !MISSION_DEFS[m].fivePlus) pool[np++] = uint8_t(m);
  }
  uint8_t pub[NUM_MISSIONS];
  int npub = 0;
  for (int i = 0; i < np; i++) {
    const MissionDef& m = MISSION_DEFS[pool[i]];
    if (m.std >= 0 && (mode == MODE_ELDER || m.whiteTitle)) pub[npub++] = pool[i];
  }
  shuffleState(s, pub, npub);
  for (int i = 0; i < std::min(2, npub); i++) s.publicMissions.push(pub[i]);
  Vec<uint8_t, NUM_MISSIONS> rest;
  for (int i = 0; i < np; i++)
    if (!s.publicMissions.contains(pool[i])) rest.push(pool[i]);
  shuffleState(s, rest.v, rest.n);
  for (int p = 0; p < n; p++) rest.spliceFront(2, s.setupOffers[p]);
  for (int i = 0; i < b.nCrypts; i++) {
    int region = b.spaces[b.crypts[i]].region;
    int size = region == R_MOUNTAINS ? 6 : region == R_PLAINS ? 5 : region == R_FOREST ? 4 : 0;
    rest.spliceFront(size, s.crypts[i]);
  }

  // Vampires.
  for (int p = 0; p < n; p++) {
    PlayerState& ps = s.players[p];
    for (int i = 0; i < NUM_STARTING; i++) ps.deck.push(STARTING_EXPAND[p][i]);
    shuffleState(s, ps.deck.v, ps.deck.n);
    ps.pos = int16_t(b.castle);
    ps.castleTile = -1;
    ps.castleOrder = -1;
  }
  for (int p = 0; p < n; p++) drawCards(s, s.players[p], 3);

  int8_t first[MAX_PLAYERS];
  for (int i = 0; i < n; i++) first[i] = int8_t(i);
  std::stable_sort(first, first + n, [&](int8_t x, int8_t y) {
    int a = handSpeed(s.players[x]), c = handSpeed(s.players[y]);
    if (a != c) return a < c;
    return x < y;
  });
  for (int i = n - 1; i >= 0; i--) s.players[first[i]].placedAt = ++s.placeCounter;

  s.nRows = int8_t(n + 1);
  refillTrack(s);
  beginSetupPick(s);
  return s;
}

}  // namespace hg
