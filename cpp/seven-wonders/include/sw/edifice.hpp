// Static Edifice-expansion database (15 cards, 5 per age). Data in
// src/edifice.gen.cpp. Mirrors packages/core/src/games/7-wonders/edifice.ts.
#pragma once
#include <cstdint>

#include "sw/resources.hpp"

namespace sw {

inline constexpr int NUM_EDIFICES = 15;
inline constexpr int MAX_ED_REWARDS = 3;

enum class EdRewardKind : uint8_t {
  Coins,                 // amount
  Shield,                // amount
  VictoryToken,          // amount (= value)
  RemoveDefeatTokens,    // -
  Production,            // resMask (choose one)
  PointsPerWonderStage,  // 1 VP / built stage (self)
  PointsPerBlue,         // 1 VP / civilian card (self)
  PointsPerColor,        // 1 VP / distinct age-card color (self)
  PointsPerBrownGreySet, // amount VP / min(brown, grey)
  DuplicateGuild,        // re-apply one own purple at scoring
};

enum class EdPenaltyKind : uint8_t {
  DiscardColor,       // color
  Coins,              // amount
  LoseVictoryTokens,  // amount
};

struct EdReward {
  EdRewardKind kind;
  int16_t amount = 0;
  uint8_t resMask = 0;
};

struct EdPenalty {
  EdPenaltyKind kind;
  int16_t amount = 0;
  uint8_t color = 0;
};

struct Edifice {
  uint8_t age;   // 1..3
  uint8_t cost;  // coins to participate
  uint8_t numRewards;
  EdReward rewards[MAX_ED_REWARDS];
  EdPenalty penalty;
};

// Generated (src/edifice.gen.cpp). Indexed 0..14; 5 per age in TS array order.
extern const Edifice EDIFICES[];
extern const char* const EDIFICE_NAMES[];

// Debt-token values by age (negative VP). Index by age 1..3.
inline constexpr int DEBT_TOKEN_VALUE[4] = {0, -2, -3, -5};

// Participation pawns by player count (round(n/2) fallback); N=5 -> 3.
inline constexpr int participationPawnCount(int playerCount) {
  switch (playerCount) {
    case 3: return 2;
    case 4: return 2;
    case 5: return 3;
    case 6: return 3;
    case 7: return 4;
    default: return (playerCount + 1) / 2;
  }
}

}  // namespace sw
