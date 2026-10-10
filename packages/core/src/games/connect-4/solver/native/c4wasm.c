/*
 * The Connect 4 solver's engine (c4core.h) as WebAssembly, for
 * bitboard-solver.ts to search with: about twice the JS solver's speed.
 * Freestanding (no imports): the table lives in this module's memory.
 *
 *   init(cols, rows)  set the board size and clear the table (0: too big)
 *   clear()           forget everything the table learned
 *   negamax(pLo, pHi, maskLo, maskHi, moves, alpha, beta, budget)
 *                     the side to move's bound on the window [alpha, beta]
 *                     (bitboard-solver.ts's `negamax`), or ABORTED once more
 *                     than `budget` nodes are searched
 *   nodes()           nodes the last negamax searched
 *
 * Build (wasi-sdk): pnpm --filter @boardgames/core c4-wasm
 */

#include "c4core.h"

#define TT_BITS 22
#define ABORTED 1000

static uint64_t tt_key_store[1u << TT_BITS];
static int8_t tt_val_store[1u << TT_BITS];

__attribute__((export_name("clear"))) void wasm_clear(void) {
  for (uint32_t i = 0; i < (1u << TT_BITS); i++) tt_val_store[i] = 0;
}

__attribute__((export_name("init"))) int wasm_init(int cols, int rows) {
  tt_bits = TT_BITS;
  tt_key = tt_key_store;
  tt_val = tt_val_store;
  wasm_clear();
  return configure(cols, rows);
}

__attribute__((export_name("negamax"))) int wasm_negamax(uint32_t pLo, uint32_t pHi,
                                                         uint32_t maskLo, uint32_t maskHi,
                                                         int moves, int alpha, int beta,
                                                         double budget) {
  uint64_t p = ((uint64_t)pHi << 32) | pLo;
  uint64_t mask = ((uint64_t)maskHi << 32) | maskLo;
  nodes = 0;
  node_budget = budget >= 18446744073709551615.0 ? ~(uint64_t)0 : (uint64_t)budget;
  aborted = 0;
  int score = negamax(p, mask, moves, alpha, beta);
  return aborted ? ABORTED : score;
}

__attribute__((export_name("nodes"))) double wasm_nodes(void) { return (double)nodes; }
