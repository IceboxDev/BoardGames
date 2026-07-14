// Static card database. Data lives in the generated src/cards.gen.cpp; this header
// declares the shapes + lookup surface. A CardType is a physical card *kind*
// (index in [...CARDS, ...GUILDS] order — order is load-bearing for deck parity).
// nameId is the dedup/chain key: Loom/Glassworks/Press share a nameId across ages.
#pragma once
#include <cstdint>

#include "sw/effect.hpp"
#include "sw/resources.hpp"

namespace sw {

inline constexpr int MAX_EFFECTS = 4;
inline constexpr int MAX_CHAIN = 3;
inline constexpr int MAX_COPIES = 4;
// Compile-time card count (== runtime NUM_CARD_TYPES; asserted in data_test).
inline constexpr int NUM_CARD_TYPES_CT = 78;

struct Card {
  uint8_t nameId;
  uint8_t age;             // 1..3
  uint8_t color;           // Color
  uint8_t bankCoins;       // cost.coins
  uint8_t resCost[NUM_RESOURCES];
  uint8_t numEffects;
  Effect effects[MAX_EFFECTS];
  uint8_t numChain;
  uint8_t chainFrom[MAX_CHAIN];  // nameIds
  uint8_t numCopies;
  uint8_t copies[MAX_COPIES];    // minPlayers thresholds (copyIndex = array index)
  bool isGuild() const { return color == Purple; }
};

// Generated (src/cards.gen.cpp).
extern const Card CARD_TYPES[];
extern const int NUM_CARD_TYPES;
extern const int NUM_NAMES;
extern const char* const NAME_TABLE[];   // nameId -> display name

inline const char* nameOf(int nameId) { return NAME_TABLE[nameId]; }
inline const Card& cardType(int id) { return CARD_TYPES[id]; }

}  // namespace sw
