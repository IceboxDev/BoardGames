#include "sw/heuristic.hpp"

#include "sw/rules.hpp"
#include "sw/wonders.hpp"

namespace sw {

// Preference multiplier for a card colour under a style.
static double colorWeight(Style style, int color) {
  switch (style) {
    case Style::Military: return color == Red ? 3.0 : 1.0;
    case Style::Science: return color == Green ? 3.0 : 1.0;
    case Style::Civilian: return color == Blue ? 3.0 : 1.0;
    case Style::Commercial: return color == Yellow ? 2.5 : (color == Brown || color == Grey ? 1.3 : 1.0);
    case Style::Balanced: return 1.5;
  }
  return 1.0;
}

// Intrinsic value of a card's effects, tinted by the style's priorities.
static double cardIntrinsic(const Card& c, Style style) {
  double v = 0;
  for (int e = 0; e < c.numEffects; e++) {
    const Effect& ef = c.effects[e];
    switch (ef.kind) {
      case EffectKind::Points: v += ef.amount * (style == Style::Civilian ? 1.4 : 1.0); break;
      case EffectKind::Shields: v += ef.amount * (style == Style::Military ? 1.6 : 0.6); break;
      case EffectKind::Science: v += style == Style::Science ? 2.2 : 0.8; break;
      case EffectKind::ScienceWildcard: v += style == Style::Science ? 2.0 : 0.7; break;
      case EffectKind::Coins: v += ef.amount * 0.15 * (style == Style::Commercial ? 1.6 : 1.0); break;
      case EffectKind::Production: v += 0.4; break;
      case EffectKind::CoinsPerCard:
      case EffectKind::CoinsPerStage: v += style == Style::Commercial ? 1.2 : 0.6; break;
      case EffectKind::PointsPerCard:
      case EffectKind::PointsPerStage:
      case EffectKind::PointsPerDefeat: v += 1.0; break;
      case EffectKind::TradeDiscount: v += style == Style::Commercial ? 1.0 : 0.4; break;
      default: break;
    }
  }
  return v;
}

static double stageValue(const Stage& s, Style style) {
  double v = 1.2;  // wonder progress is inherently useful
  for (int e = 0; e < s.numEffects; e++) {
    const Effect& ef = s.effects[e];
    if (ef.kind == EffectKind::Points) v += ef.amount * 0.9;
    else if (ef.kind == EffectKind::Shields) v += ef.amount * (style == Style::Military ? 1.4 : 0.6);
    else v += 0.6;  // special powers / production / science
  }
  return v;
}

static double moveScore(const GameState& st, int seat, const Move& m, Style style) {
  if (m.kind == MoveKind::SkipPending) return 0.2;
  if (m.kind == MoveKind::Discard) return 0.4;  // coins fallback, low
  if (m.kind == MoveKind::PickDiscard) {
    const Card& c = cardType(st.discard[m.card]);
    return colorWeight(style, c.color) + cardIntrinsic(c, style);
  }
  const Card& c = cardType(st.hands[seat][m.card]);
  double pay = m.pay == PayKind::Resources ? 0.25 * (m.payLeft + m.payRight) : 0.0;
  if (m.pay == PayKind::Chain) pay -= 1.0;       // chains are free -> bonus
  else if (m.pay == PayKind::FreeBuild) pay -= 0.8;

  if (m.kind == MoveKind::PlayCard) {
    return colorWeight(style, c.color) + cardIntrinsic(c, style) - 0.2 * c.bankCoins - pay;
  }
  // BuildWonder
  const WonderSide& ws = wonderSide(st.players[seat].wonderId, st.players[seat].side);
  double v = stageValue(ws.stages[st.players[seat].stagesBuilt], style) - pay;
  if (m.participate) v += 0.3;
  return v;
}

Move heuristicMove(const GameState& st, int seat, Style style, Rng& rng) {
  MoveBuffer b;
  legalActions(st, seat, b);
  int best = 0;
  double bestScore = -1e18;
  for (int i = 0; i < b.count; i++) {
    double s = moveScore(st, seat, b.moves[i], style) + rng.next() * 0.15;  // epsilon
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return b.moves[best];
}

}  // namespace sw
