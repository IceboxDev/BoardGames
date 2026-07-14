#include "sw/rules.hpp"

#include "sw/board.hpp"
#include "sw/edifice.hpp"
#include "sw/payment.hpp"
#include "sw/wonders.hpp"

namespace sw {

int activePlayer(const GameState& st) {
  if (st.phase == Phase::Pending && st.pendingCount > 0) return st.pendingQueue[0].player;
  return -1;
}

// Enumerate every discard / play-card / build-wonder for one hand card.
static void buildActionsForCard(const GameState& st, int player, int handIdx, bool seventh,
                                MoveBuffer& out) {
  const PlayerState& p = st.players[player];
  const Card& def = cardType(st.hands[player][handIdx]);

  // Discard is always legal.
  Move dis;
  dis.kind = MoveKind::Discard;
  dis.card = uint8_t(handIdx);
  dis.seventh = seventh;
  out.push(dis);

  // Play the card (never a duplicate name).
  if (!hasName(p, def.nameId)) {
    bool chain = false;
    for (int k = 0; k < def.numChain; k++)
      if (hasName(p, def.chainFrom[k])) chain = true;

    if (chain) {
      Move m;
      m.kind = MoveKind::PlayCard;
      m.card = uint8_t(handIdx);
      m.pay = PayKind::Chain;
      m.seventh = seventh;
      out.push(m);
    } else {
      PayResult pr = solvePayments(st, player, def.resCost, def.bankCoins);
      for (int i = 0; i < pr.count; i++) {
        Move m;
        m.kind = MoveKind::PlayCard;
        m.card = uint8_t(handIdx);
        m.pay = PayKind::Resources;
        m.payLeft = pr.splits[i].left;
        m.payRight = pr.splits[i].right;
        m.seventh = seventh;
        out.push(m);
      }
      if (hasBuiltStageEffect(p, EffectKind::FreeBuildPerAge) && !p.freeBuildUsedThisAge) {
        Move m;
        m.kind = MoveKind::PlayCard;
        m.card = uint8_t(handIdx);
        m.pay = PayKind::FreeBuild;
        m.seventh = seventh;
        out.push(m);
      }
    }
  }

  // Bury the card to build the next wonder stage (never chain/free-build).
  const WonderSide& side = wonderSide(p.wonderId, p.side);
  if (p.stagesBuilt < side.numStages) {
    const Stage& stage = side.stages[p.stagesBuilt];
    PayResult pr = solvePayments(st, player, stage.resCost, stage.bankCoins);

    // Edifice participation: this age's project, if open and not yet joined.
    const EdSlot* ed = st.edificeCount > 0 ? &st.edifices[st.age - 1] : nullptr;
    bool canParticipate = false;
    int participationCost = 0;
    if (ed && ed->status == EdStatus::Project) {
      canParticipate = true;
      for (int i = 0; i < ed->numParticipants; i++)
        if (ed->participants[i] == player) canParticipate = false;
      if (canParticipate) participationCost = EDIFICES[ed->edificeId].cost;
    }
    int stageCoinCost = stage.bankCoins;

    for (int i = 0; i < pr.count; i++) {
      Move m;
      m.kind = MoveKind::BuildWonder;
      m.card = uint8_t(handIdx);
      m.pay = PayKind::Resources;
      m.payLeft = pr.splits[i].left;
      m.payRight = pr.splits[i].right;
      m.seventh = seventh;
      out.push(m);
      int coinsLeft = p.coins - pr.splits[i].left - pr.splits[i].right - stageCoinCost;
      if (canParticipate && coinsLeft >= participationCost) {
        Move mp = m;
        mp.participate = true;
        out.push(mp);
      }
    }
  }
}

void legalActions(const GameState& st, int player, MoveBuffer& out) {
  out.clear();

  if (st.phase == Phase::Selecting) {
    if (st.hasSelection[player]) return;
    for (int h = 0; h < st.handCount[player]; h++)
      buildActionsForCard(st, player, h, false, out);
    return;
  }

  if (st.phase == Phase::Pending && st.pendingCount > 0 && st.pendingQueue[0].player == player) {
    const PendingItem& pend = st.pendingQueue[0];
    if (pend.kind == PendingKind::Halikarnassos) {
      Move skip;
      skip.kind = MoveKind::SkipPending;
      out.push(skip);
      const PlayerState& p = st.players[player];
      uint64_t seen[2] = {0, 0};
      for (int d = 0; d < st.discardCount; d++) {
        int nameId = cardType(st.discard[d]).nameId;
        if (hasName(p, nameId)) continue;
        if (seen[nameId >> 6] & (uint64_t(1) << (nameId & 63))) continue;
        seen[nameId >> 6] |= (uint64_t(1) << (nameId & 63));
        Move m;
        m.kind = MoveKind::PickDiscard;
        m.card = uint8_t(d);
        out.push(m);
      }
    } else {  // babylon-seventh: resolve the leftover 7th card like a normal turn.
      if (st.handCount[player] == 0) {
        Move skip;
        skip.kind = MoveKind::SkipPending;
        out.push(skip);
        return;
      }
      buildActionsForCard(st, player, 0, true, out);
    }
  }
}

bool isLegal(const GameState& st, int player, const Move& m) {
  MoveBuffer buf;
  legalActions(st, player, buf);
  for (int i = 0; i < buf.count; i++)
    if (buf.moves[i] == m) return true;
  return false;
}

}  // namespace sw
