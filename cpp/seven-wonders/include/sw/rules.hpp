// Active player + legal-move enumeration. Port of rules.ts (buildActionsForCard /
// getActivePlayer / getLegalActions).
#pragma once
#include "sw/move.hpp"
#include "sw/state.hpp"

namespace sw {

inline constexpr int MAX_MOVES = 1024;

struct MoveBuffer {
  Move moves[MAX_MOVES];
  int count = 0;
  void push(const Move& m) {
    if (count < MAX_MOVES) moves[count++] = m;
  }
  void clear() { count = 0; }
  const Move* begin() const { return moves; }
  const Move* end() const { return moves + count; }
};

// -1 during simultaneous selecting/revealing; the head-of-queue player in pending.
int activePlayer(const GameState& st);

// Fill `out` with every legal move for `player` in the current phase.
void legalActions(const GameState& st, int player, MoveBuffer& out);

// Whether `m` is currently legal for `player` (used to validate applied moves).
bool isLegal(const GameState& st, int player, const Move& m);

}  // namespace sw
