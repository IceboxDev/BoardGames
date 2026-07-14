// Small derived-quantity helpers over a player's board, mirroring board.ts.
// Kept inline/header-only since they're used across rules/engine/scoring.
#pragma once
#include "sw/state.hpp"
#include "sw/wonders.hpp"

namespace sw {

inline bool hasBuiltStageEffect(const PlayerState& p, EffectKind kind) {
  const WonderSide& ws = wonderSide(p.wonderId, p.side);
  for (int s = 0; s < p.stagesBuilt; s++)
    for (int e = 0; e < ws.stages[s].numEffects; e++)
      if (ws.stages[s].effects[e].kind == kind) return true;
  return false;
}

// Total military strength: red-card shields + built-stage shields + edifice bonus.
inline int countShields(const PlayerState& p) {
  int sh = p.bonusShields;
  for (int t = 0; t < p.numTableau; t++) {
    const Card& c = cardType(p.tableau[t]);
    for (int e = 0; e < c.numEffects; e++)
      if (c.effects[e].kind == EffectKind::Shields) sh += c.effects[e].amount;
  }
  const WonderSide& ws = wonderSide(p.wonderId, p.side);
  for (int s = 0; s < p.stagesBuilt; s++)
    for (int e = 0; e < ws.stages[s].numEffects; e++)
      if (ws.stages[s].effects[e].kind == EffectKind::Shields) sh += ws.stages[s].effects[e].amount;
  return sh;
}

// Count of tableau cards of a given color (self board only).
inline int countColor(const PlayerState& p, int color) {
  int n = 0;
  for (int t = 0; t < p.numTableau; t++)
    if (cardType(p.tableau[t]).color == color) n++;
  return n;
}

// Sum a scoped count (self / left / right) of some per-player quantity.
template <class F>
inline int scopedSum(const GameState& st, int pi, uint8_t scopes, F valueOf) {
  int total = 0;
  if (scopes & SELF) total += valueOf(st.players[pi]);
  if (scopes & LEFT) total += valueOf(st.players[leftOf(pi)]);
  if (scopes & RIGHT) total += valueOf(st.players[rightOf(pi)]);
  return total;
}

// Coins granted immediately when an effect enters play (point effects score later).
inline int instantCoins(const Effect& e, const GameState& st, int pi) {
  switch (e.kind) {
    case EffectKind::Coins:
      return e.amount;
    case EffectKind::CoinsPerCard:
      return e.amount *
             scopedSum(st, pi, e.scopes, [&](const PlayerState& p) { return countColor(p, e.color); });
    case EffectKind::CoinsPerStage:
      return e.amount *
             scopedSum(st, pi, e.scopes, [&](const PlayerState& p) { return int(p.stagesBuilt); });
    default:
      return 0;
  }
}

// Rebuild the nameId dup-mask from the tableau (after an Edifice discard removes a card).
inline void rebuildNameMask(PlayerState& p) {
  p.nameMask[0] = p.nameMask[1] = 0;
  for (int t = 0; t < p.numTableau; t++) setName(p, cardType(p.tableau[t]).nameId);
}

}  // namespace sw
