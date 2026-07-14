// Resource/trade payment solver — port of payment.ts. Returns the Pareto-minimal
// frontier of {coins-to-left, coins-to-right} splits that pay a cost, or none.
#pragma once
#include <cstdint>

#include "sw/state.hpp"

namespace sw {

struct Split {
  uint8_t left = 0;
  uint8_t right = 0;
};

inline constexpr int MAX_SPLITS = 32;

struct PayResult {
  bool affordable = false;
  int count = 0;
  Split splits[MAX_SPLITS];
};

// Pareto frontier of coin splits to pay (bankCoins + resCost). resCost is a
// 7-entry per-resource count array. Splits are sorted by (total, left).
PayResult solvePayments(const GameState& st, int player, const uint8_t* resCost, int bankCoins);

// 1 if `buyer` has a matching trade-discount toward `side` (0=left,1=right), else 2.
int getTradeCost(const GameState& st, int buyer, int side, int resource);

}  // namespace sw
