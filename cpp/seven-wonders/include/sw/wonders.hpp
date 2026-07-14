// Static wonder database (7 wonders x A/B sides). Data in src/wonders.gen.cpp.
#pragma once
#include <cstdint>

#include "sw/effect.hpp"
#include "sw/resources.hpp"

namespace sw {

inline constexpr int MAX_STAGE_EFFECTS = 3;  // Rhodes B stage bundles shields+points+coins
inline constexpr int MAX_STAGES = 4;         // Giza B has 4 stages

struct Stage {
  uint8_t bankCoins;
  uint8_t resCost[NUM_RESOURCES];
  uint8_t numEffects;
  Effect effects[MAX_STAGE_EFFECTS];
};

struct WonderSide {
  uint8_t initialResource;  // Resource
  uint8_t numStages;
  Stage stages[MAX_STAGES];
};

struct Wonder {
  uint8_t id;           // WonderId
  WonderSide sides[2];  // [0]=A, [1]=B
};

// Generated (src/wonders.gen.cpp).
extern const Wonder WONDERS[];
extern const char* const WONDER_NAMES[];  // WonderId -> display name

inline const Wonder& wonder(int id) { return WONDERS[id]; }
inline const WonderSide& wonderSide(int id, int side /*0=A,1=B*/) { return WONDERS[id].sides[side]; }

}  // namespace sw
