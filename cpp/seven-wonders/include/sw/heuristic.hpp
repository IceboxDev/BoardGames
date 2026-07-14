// Style-distinct heuristic archetype agents (M3). Fast, search-free policies that
// each pursue a coherent strategy (military / science / civilian / commercial /
// balanced). They give the self-play population diversity (so the net learns a
// robust best-response, not a brittle self-play fixed point) and serve as a
// held-out opponent pool far more meaningful than uniform-random.
#pragma once
#include <cstdint>

#include "sw/move.hpp"
#include "sw/rng.hpp"
#include "sw/state.hpp"

namespace sw {

enum class Style : uint8_t { Military, Science, Civilian, Commercial, Balanced };
inline constexpr int NUM_STYLES = 5;

// Greedy style-weighted move (epsilon-greedy for diversity). Always legal.
Move heuristicMove(const GameState& st, int seat, Style style, Rng& rng);

}  // namespace sw
