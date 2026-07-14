// Deterministic game setup. Consumes the RNG in the exact order of the TS
// createInitialState so a seed deals a byte-identical game (validated by parity).
#pragma once
#include "sw/state.hpp"

namespace sw {

enum class SideMode : uint8_t { A = 0, B = 1, Random = 2 };

GameState createInitialState(uint32_t seed, SideMode sideMode = SideMode::Random,
                             bool edifice = false);

}  // namespace sw
