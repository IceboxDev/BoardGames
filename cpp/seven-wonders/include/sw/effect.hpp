// Compact POD effect, shared by cards and wonder stages. Mirrors the TS
// CardEffect union (13 kinds) plus the 5 special wonder-stage kinds.
#pragma once
#include <cstdint>

namespace sw {

enum class EffectKind : uint8_t {
  Production,       // resMask (multi-bit => choose one), count (single-resource multi-output)
  Points,           // amount
  Shields,          // amount
  Science,          // science symbol
  Coins,            // amount (instant, at play)
  CoinsPerCard,     // amount * count(color) over scopes  (instant)
  CoinsPerStage,    // amount * stagesBuilt over scopes    (instant)
  PointsPerCard,    // amount * count(color) over scopes   (end-game)
  PointsPerStage,   // amount * stagesBuilt over scopes     (end-game)
  PointsIfWonderComplete,  // amount iff every stage of own wonder side is built (Decorators)
  TradeDiscount,    // tradeRaw + neighbors
  ScienceWildcard,  // any one symbol, resolved at scoring
  // Wonder-stage-only:
  PlayDiscarded,    // Halikarnassos
  FreeFirstOfColor,  // Olympia A: first card of each colour free
  FreeFirstOfAge,    // Olympia B: first card of each age free
  FreeLastOfAge,     // Olympia B: last card of each age free
  PlaySeventhCard,   // Babylon B
};

struct Effect {
  EffectKind kind = EffectKind::Points;
  uint8_t resMask = 0;    // Production: resource bitmask
  uint8_t count = 1;      // Production: fixed multi-output (single-resource only)
  uint8_t science = 0;    // Science: symbol index
  uint8_t color = 0;      // CoinsPerCard / PointsPerCard: target color
  uint8_t scopes = 0;     // SELF|LEFT|RIGHT for per-card/stage counting
  uint8_t tradeRaw = 0;   // TradeDiscount: 1 = raw, 0 = manufactured
  uint8_t neighbors = 0;  // TradeDiscount: bit0 = left, bit1 = right
  int16_t amount = 0;     // Points/Shields/Coins/per-X amount
};

}  // namespace sw
