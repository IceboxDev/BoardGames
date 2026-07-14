#include "sw/engine.hpp"

#include <algorithm>
#include <cassert>
#include <climits>

#include "sw/board.hpp"
#include "sw/edifice.hpp"
#include "sw/rules.hpp"
#include "sw/wonders.hpp"

namespace sw {

// ── small mutators ───────────────────────────────────────────────────────────
static void removeHandAt(GameState& st, int p, int idx) {
  for (int k = idx; k + 1 < st.handCount[p]; k++) st.hands[p][k] = st.hands[p][k + 1];
  st.handCount[p]--;
}
static void removeDiscardAt(GameState& st, int idx) {
  for (int k = idx; k + 1 < st.discardCount; k++) st.discard[k] = st.discard[k + 1];
  st.discardCount--;
}
static bool isParticipant(const EdSlot& ed, int player) {
  for (int i = 0; i < ed.numParticipants; i++)
    if (ed.participants[i] == player) return true;
  return false;
}
static void removeNegativeTokens(PlayerState& p) {
  int w = 0;
  for (int k = 0; k < p.numTokens; k++)
    if (p.militaryTokens[k] >= 0) p.militaryTokens[w++] = p.militaryTokens[k];
  p.numTokens = uint8_t(w);
}
static int cardPointValue(const Card& c) {
  int pts = 0;
  for (int e = 0; e < c.numEffects; e++)
    if (c.effects[e].kind == EffectKind::Points) pts += c.effects[e].amount;
  return pts;
}

// ── Edifice construction / penalties ─────────────────────────────────────────
static void constructEdifice(EdSlot& ed, PlayerState* players) {
  ed.status = EdStatus::Built;
  ed.pawnsLeft = 0;
  const Edifice& def = EDIFICES[ed.edificeId];
  for (int k = 0; k < ed.numParticipants; k++) {
    PlayerState& p = players[ed.participants[k]];
    for (int r = 0; r < def.numRewards; r++) {
      const EdReward& rw = def.rewards[r];
      switch (rw.kind) {
        case EdRewardKind::Coins: p.coins += rw.amount; break;
        case EdRewardKind::Shield: p.bonusShields += uint8_t(rw.amount); break;
        case EdRewardKind::VictoryToken: p.victoryTokens[p.numVictory++] = int8_t(rw.amount); break;
        case EdRewardKind::RemoveDefeatTokens: removeNegativeTokens(p); break;
        case EdRewardKind::Production: p.bonusProd[p.numBonusProd++] = rw.resMask; break;
        default: break;  // point rewards computed at scoring
      }
    }
  }
}

static void applyEdificePenalty(PlayerState& p, const EdPenalty& pen, int age) {
  auto takeDebt = [&] { p.debtTokens[p.numDebt++] = int8_t(DEBT_TOKEN_VALUE[age]); };
  switch (pen.kind) {
    case EdPenaltyKind::Coins:
      if (p.coins >= pen.amount)
        p.coins -= pen.amount;
      else
        takeDebt();
      break;
    case EdPenaltyKind::DiscardColor: {
      int worst = -1, worstVal = INT_MAX;
      for (int t = 0; t < p.numTableau; t++) {
        const Card& c = cardType(p.tableau[t]);
        if (c.color != pen.color) continue;
        int v = cardPointValue(c);
        if (worst < 0 || v < worstVal) {
          worst = t;
          worstVal = v;
        }
      }
      if (worst < 0) {
        takeDebt();
        break;
      }
      for (int k = worst; k + 1 < p.numTableau; k++) p.tableau[k] = p.tableau[k + 1];
      p.numTableau--;
      rebuildNameMask(p);
      break;
    }
    case EdPenaltyKind::LoseVictoryTokens: {
      int posCount = 0;
      for (int k = 0; k < p.numTokens; k++)
        if (p.militaryTokens[k] > 0) posCount++;
      if (posCount + p.numVictory < pen.amount) {
        takeDebt();
        break;
      }
      int toRemove = pen.amount;
      int8_t positives[MAX_TOKENS], kept[MAX_TOKENS];
      int np = 0, nk = 0;
      for (int k = 0; k < p.numTokens; k++) {
        if (p.militaryTokens[k] > 0)
          positives[np++] = p.militaryTokens[k];
        else
          kept[nk++] = p.militaryTokens[k];
      }
      std::sort(positives, positives + np);
      for (int k = 0; k < np; k++) {
        if (toRemove > 0)
          toRemove--;
        else
          kept[nk++] = positives[k];
      }
      for (int k = 0; k < nk; k++) p.militaryTokens[k] = kept[k];
      p.numTokens = uint8_t(nk);
      std::sort(p.victoryTokens, p.victoryTokens + p.numVictory);
      int nv = 0;
      for (int k = toRemove; k < p.numVictory; k++) p.victoryTokens[nv++] = p.victoryTokens[k];
      p.numVictory = uint8_t(nv);
      break;
    }
  }
}

// ── forward decls for the turn/age chain ─────────────────────────────────────
static void finishTurn(GameState& st);
static void resolveEdificeEndOfAge(GameState& st);
static void resolveMilitary(GameState& st);
static void advanceAge(GameState& st);

// ── Selection ────────────────────────────────────────────────────────────────
void applySelection(GameState& st, int player, const Move& m) {
  assert(st.phase == Phase::Selecting && !st.hasSelection[player]);
  assert(isLegal(st, player, m));
  st.selections[player] = m;
  st.hasSelection[player] = true;
  bool all = true;
  for (int i = 0; i < N; i++)
    if (!st.hasSelection[i]) all = false;
  if (all) st.phase = Phase::Revealing;
}

// ── Reveal ───────────────────────────────────────────────────────────────────
void applyReveal(GameState& st) {
  assert(st.phase == Phase::Revealing);
  EdSlot* curEd = st.edificeCount > 0 ? &st.edifices[st.age - 1] : nullptr;

  // 1) Coin movements — all against pre-reveal balances.
  int deltas[N] = {0};
  for (int i = 0; i < N; i++) {
    const Move& sel = st.selections[i];
    if (sel.kind == MoveKind::Discard || sel.pay != PayKind::Resources) continue;
    deltas[i] -= sel.payLeft + sel.payRight;
    deltas[leftOf(i)] += sel.payLeft;
    deltas[rightOf(i)] += sel.payRight;
    const PlayerState& p = st.players[i];
    if (sel.kind == MoveKind::PlayCard) {
      deltas[i] -= cardType(st.hands[i][sel.card]).bankCoins;
    } else {  // BuildWonder
      const Stage& stage = wonderSide(p.wonderId, p.side).stages[p.stagesBuilt];
      deltas[i] -= stage.bankCoins;
      if (sel.participate && curEd) deltas[i] -= EDIFICES[curEd->edificeId].cost;
    }
  }
  for (int i = 0; i < N; i++) st.players[i].coins += deltas[i];

  // 2) Placement (capture the played card type before removing it from hand).
  uint8_t selCard[N];
  for (int i = 0; i < N; i++) {
    const Move& sel = st.selections[i];
    selCard[i] = st.hands[i][sel.card];
    removeHandAt(st, i, sel.card);
    if (sel.kind == MoveKind::PlayCard) {
      addTableauCard(st.players[i], selCard[i]);
      if (sel.pay == PayKind::FreeBuild) st.players[i].freeBuildUsedThisAge = true;
    } else if (sel.kind == MoveKind::BuildWonder) {
      st.players[i].stagesBuilt++;
    } else {  // Discard
      st.discard[st.discardCount++] = selCard[i];
      st.players[i].coins += DISCARD_COIN_VALUE;
    }
  }

  // 3) Instant coin effects on the post-placement board; collect Halikarnassos.
  PendingItem halik[N];
  int nhalik = 0;
  for (int i = 0; i < N; i++) {
    const Move& sel = st.selections[i];
    if (sel.kind == MoveKind::PlayCard) {
      const Card& c = cardType(selCard[i]);
      for (int e = 0; e < c.numEffects; e++) st.players[i].coins += instantCoins(c.effects[e], st, i);
    } else if (sel.kind == MoveKind::BuildWonder) {
      const PlayerState& p = st.players[i];
      const Stage& stage = wonderSide(p.wonderId, p.side).stages[p.stagesBuilt - 1];
      for (int e = 0; e < stage.numEffects; e++) {
        st.players[i].coins += instantCoins(stage.effects[e], st, i);
        if (stage.effects[e].kind == EffectKind::PlayDiscarded)
          halik[nhalik++] = {PendingKind::Halikarnassos, uint8_t(i)};
      }
    }
  }

  // 3b) Edifice participation: joiners take a pawn; last pawn constructs it.
  if (curEd && curEd->status == EdStatus::Project) {
    int joined = 0;
    for (int i = 0; i < N; i++) {
      const Move& sel = st.selections[i];
      if (sel.kind == MoveKind::BuildWonder && sel.participate && !isParticipant(*curEd, i)) {
        curEd->participants[curEd->numParticipants++] = uint8_t(i);
        joined++;
      }
    }
    if (joined > 0) {
      curEd->pawnsLeft = uint8_t(std::max(0, int(curEd->pawnsLeft) - joined));
      if (curEd->pawnsLeft == 0) constructEdifice(*curEd, st.players);
    }
  }

  // 4) Turn 6 leftover: Babylon-B resolves the 7th card (pending); else discard.
  PendingItem pq[2 * N];
  int pqn = 0;
  if (st.turn == TURNS_PER_AGE) {
    for (int i = 0; i < N; i++) {
      if (st.handCount[i] == 0) continue;
      uint8_t leftover = st.hands[i][0];
      if (hasBuiltStageEffect(st.players[i], EffectKind::PlaySeventhCard)) {
        pq[pqn++] = {PendingKind::BabylonSeventh, uint8_t(i)};
      } else {
        st.discard[st.discardCount++] = leftover;
        st.handCount[i] = 0;
      }
    }
  }
  for (int k = 0; k < nhalik; k++) pq[pqn++] = halik[k];  // babylon-sevenths, then halik

  for (int i = 0; i < N; i++) st.hasSelection[i] = false;
  st.pendingCount = uint8_t(pqn);
  for (int k = 0; k < pqn; k++) st.pendingQueue[k] = pq[k];
  st.phase = Phase::Pending;

  if (pqn == 0) finishTurn(st);
}

// ── Pending actions ──────────────────────────────────────────────────────────
void applyPendingAction(GameState& st, int player, const Move& m) {
  assert(st.phase == Phase::Pending && st.pendingCount > 0);
  const PendingItem pending = st.pendingQueue[0];
  assert(pending.player == player);
  assert(isLegal(st, player, m));

  // pop the head
  for (int k = 0; k + 1 < st.pendingCount; k++) st.pendingQueue[k] = st.pendingQueue[k + 1];
  st.pendingCount--;

  PlayerState& p = st.players[player];

  if (pending.kind == PendingKind::Halikarnassos) {
    if (m.kind == MoveKind::PickDiscard) {
      uint8_t card = st.discard[m.card];
      removeDiscardAt(st, m.card);
      addTableauCard(p, card);
      const Card& c = cardType(card);
      for (int e = 0; e < c.numEffects; e++) p.coins += instantCoins(c.effects[e], st, player);
    }
    // SkipPending: nothing
  } else if (m.seventh) {  // babylon-seventh wraps an inner action
    uint8_t card = st.hands[player][m.card];
    st.handCount[player] = 0;
    if (m.kind == MoveKind::Discard) {
      st.discard[st.discardCount++] = card;
      p.coins += DISCARD_COIN_VALUE;
    } else {
      if (m.pay == PayKind::Resources) {
        p.coins -= m.payLeft + m.payRight;
        st.players[leftOf(player)].coins += m.payLeft;
        st.players[rightOf(player)].coins += m.payRight;
      }
      if (m.kind == MoveKind::PlayCard) {
        if (m.pay == PayKind::Resources) p.coins -= cardType(card).bankCoins;
        if (m.pay == PayKind::FreeBuild) p.freeBuildUsedThisAge = true;
        addTableauCard(p, card);
        const Card& c = cardType(card);
        for (int e = 0; e < c.numEffects; e++) p.coins += instantCoins(c.effects[e], st, player);
      } else {  // BuildWonder
        const Stage& stage = wonderSide(p.wonderId, p.side).stages[p.stagesBuilt];
        if (m.pay == PayKind::Resources) p.coins -= stage.bankCoins;
        p.stagesBuilt++;
        const Stage& built = wonderSide(p.wonderId, p.side).stages[p.stagesBuilt - 1];
        for (int e = 0; e < built.numEffects; e++) {
          p.coins += instantCoins(built.effects[e], st, player);
          if (built.effects[e].kind == EffectKind::PlayDiscarded)
            st.pendingQueue[st.pendingCount++] = {PendingKind::Halikarnassos, uint8_t(player)};
        }
      }
    }
  }

  if (st.pendingCount == 0) finishTurn(st);
}

// ── Turn / age transitions ───────────────────────────────────────────────────
static void finishTurn(GameState& st) {
  if (st.turn < TURNS_PER_AGE) {
    bool left = passLeft(st.age);
    uint8_t newHands[N][MAX_HAND];
    uint8_t newCount[N];
    for (int i = 0; i < N; i++) {
      int target = left ? leftOf(i) : rightOf(i);
      newCount[target] = st.handCount[i];
      for (int k = 0; k < st.handCount[i]; k++) newHands[target][k] = st.hands[i][k];
    }
    for (int i = 0; i < N; i++) {
      st.handCount[i] = newCount[i];
      for (int k = 0; k < newCount[i]; k++) st.hands[i][k] = newHands[i][k];
    }
    st.turn++;
    st.phase = Phase::Selecting;
    return;
  }
  resolveEdificeEndOfAge(st);
  resolveMilitary(st);
  advanceAge(st);
}

static void resolveEdificeEndOfAge(GameState& st) {
  if (st.edificeCount == 0) return;
  EdSlot& ed = st.edifices[st.age - 1];
  if (ed.status != EdStatus::Project) return;
  ed.status = EdStatus::Failed;
  const Edifice& def = EDIFICES[ed.edificeId];
  for (int i = 0; i < N; i++) {
    if (isParticipant(ed, i)) continue;
    applyEdificePenalty(st.players[i], def.penalty, st.age);
  }
}

static void resolveMilitary(GameState& st) {
  int shields[N];
  for (int i = 0; i < N; i++) shields[i] = countShields(st.players[i]);
  int victory = MILITARY_VICTORY_POINTS[st.age];
  for (int i = 0; i < N; i++) {
    int j = leftOf(i);
    if (shields[i] > shields[j]) {
      st.players[i].militaryTokens[st.players[i].numTokens++] = int8_t(victory);
      st.players[j].militaryTokens[st.players[j].numTokens++] = int8_t(MILITARY_DEFEAT_POINTS);
    } else if (shields[j] > shields[i]) {
      st.players[j].militaryTokens[st.players[j].numTokens++] = int8_t(victory);
      st.players[i].militaryTokens[st.players[i].numTokens++] = int8_t(MILITARY_DEFEAT_POINTS);
    }
    // tie: no token
  }
}

static void advanceAge(GameState& st) {
  if (st.age == 3) {
    st.phase = Phase::GameOver;
    return;
  }
  st.age++;
  const uint8_t* deck = st.age == 2 ? st.deck2 : st.deck3;
  for (int p = 0; p < N; p++) {
    st.handCount[p] = 7;
    for (int k = 0; k < 7; k++) st.hands[p][k] = deck[p * 7 + k];
  }
  for (int i = 0; i < N; i++) st.players[i].freeBuildUsedThisAge = false;
  st.turn = 1;
  st.phase = Phase::Selecting;
}

}  // namespace sw
