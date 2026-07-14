// State transitions — port of game-engine.ts. All mutate the GameState in place
// (the point of the value-type design: `GameState next = cur; apply(next, m);`).
#pragma once
#include "sw/move.hpp"
#include "sw/state.hpp"

namespace sw {

// Record a player's simultaneous selection; flips to Revealing when all are in.
void applySelection(GameState& st, int player, const Move& m);

// Resolve all selections: pay/place/instant-coins/edifice, then pending or finish.
void applyReveal(GameState& st);

// Resolve the head-of-queue pending action (Babylon 7th / Halikarnassos).
void applyPendingAction(GameState& st, int player, const Move& m);

inline bool isGameOver(const GameState& st) { return st.phase == Phase::GameOver; }

}  // namespace sw
