/*
 * The Connect 4 solver's engine, shared by the book builder's CLI
 * (c4solve.c) and the browser's / server's WebAssembly (c4wasm.c): the same
 * algorithm as bitboard-solver.ts (Pascal Pons' scheme: 64-bit bitboard,
 * negamax with alpha-beta, a null-window search on the score, only non-losing
 * moves, threat-ordered moves, a transposition table), with real 64-bit
 * integers, so it runs several times faster than the JS pair-of-halves
 * version. Header-only and freestanding: no libc, no allocation — the host
 * provides the table.
 */

#ifndef C4CORE_H
#define C4CORE_H

#include <stdint.h>

static int COLS, ROWS, STRIDE, CELLS, MIN_SCORE, MAX_SCORE;
static uint64_t BOTTOM, BOARD, COL_MASK[16];
static int ORDER[16];

/* The transposition table: the host points these at `1 << tt_bits` entries. */
static int tt_bits;
static uint64_t *tt_key;
static int8_t *tt_val;

static int popcount64(uint64_t x) { return __builtin_popcountll(x); }

static uint64_t possible(uint64_t mask) { return (mask + BOTTOM) & BOARD; }

/* Empty cells that would complete four for the discs `p`. */
static uint64_t winning(uint64_t p, uint64_t mask) {
  uint64_t r = (p << 1) & (p << 2) & (p << 3);
  int dirs[3] = {STRIDE, STRIDE - 1, STRIDE + 1};
  for (int k = 0; k < 3; k++) {
    int d = dirs[k];
    uint64_t a = (p << d) & (p << (2 * d));
    r |= a & (p << (3 * d));
    r |= a & (p >> d);
    a = (p >> d) & (p >> (2 * d));
    r |= a & (p << d);
    r |= a & (p >> (3 * d));
  }
  return r & (BOARD ^ mask);
}

static uint64_t non_losing(uint64_t p, uint64_t mask) {
  uint64_t poss = possible(mask);
  uint64_t opp = winning(p ^ mask, mask);
  uint64_t forced = poss & opp;
  if (forced) {
    if (forced & (forced - 1)) return 0;
    poss = forced;
  }
  return poss & ~(opp >> 1);
}

static uint32_t tt_index(uint64_t key) {
  return (uint32_t)((key * 0x9E3779B97F4A7C15ull) >> (64 - tt_bits));
}

/* Nodes searched, and the most allowed: past it the search stops (`aborted`)
   and every caller returns at once, storing nothing half-searched. */
static uint64_t nodes;
static uint64_t node_budget = ~(uint64_t)0;
static int aborted;

static int negamax(uint64_t p, uint64_t mask, int nb, int alpha, int beta) {
  if (++nodes > node_budget) {
    aborted = 1;
    return 0;
  }
  uint64_t next = non_losing(p, mask);
  if (!next) return -((CELLS - nb) >> 1);
  if (nb >= CELLS - 2) return 0;

  int min = -((CELLS - 2 - nb) >> 1);
  if (alpha < min) {
    alpha = min;
    if (alpha >= beta) return alpha;
  }
  int max = (CELLS - 1 - nb) >> 1;

  uint64_t key = p + mask;
  uint32_t idx = tt_index(key);
  if (tt_key[idx] == key) {
    int val = tt_val[idx];
    if (val != 0) {
      if (val > MAX_SCORE - MIN_SCORE + 1) {
        min = val + 2 * MIN_SCORE - MAX_SCORE - 2;
        if (alpha < min) {
          alpha = min;
          if (alpha >= beta) return alpha;
        }
      } else {
        max = val + MIN_SCORE - 1;
        if (beta > max) {
          beta = max;
          if (alpha >= beta) return beta;
        }
      }
    }
  }

  uint64_t mv[16];
  int sc[16];
  int n = 0;
  for (int i = COLS - 1; i >= 0; i--) {
    uint64_t m = next & COL_MASK[ORDER[i]];
    if (!m) continue;
    int s = popcount64(winning(p | m, mask));
    int j = n++;
    while (j > 0 && sc[j - 1] > s) {
      mv[j] = mv[j - 1];
      sc[j] = sc[j - 1];
      j--;
    }
    mv[j] = m;
    sc[j] = s;
  }

  for (int i = n - 1; i >= 0; i--) {
    int score = -negamax(p ^ mask, mask | mv[i], nb + 1, -beta, -alpha);
    if (aborted) return 0;
    if (score >= beta) {
      tt_key[idx] = key;
      tt_val[idx] = (int8_t)(score + MAX_SCORE - 2 * MIN_SCORE + 2);
      return score;
    }
    if (score > alpha) alpha = score;
  }
  tt_key[idx] = key;
  tt_val[idx] = (int8_t)(alpha - MIN_SCORE + 1);
  return alpha;
}

static inline int solve(uint64_t p, uint64_t mask, int nb) {
  if (possible(mask) & winning(p, mask)) return (CELLS + 1 - nb) >> 1;
  if (nb >= CELLS) return 0;
  int min = -((CELLS - nb) >> 1);
  int max = (CELLS + 1 - nb) >> 1;
  while (min < max) {
    int med = min + (max - min) / 2;
    if (med <= 0 && min / 2 < med) med = min / 2;
    else if (med >= 0 && max / 2 > med) med = max / 2;
    int r = negamax(p, mask, nb, med, med + 1);
    if (aborted) return 0;
    if (r <= med) max = r;
    else min = r;
  }
  return min;
}

/* Set the board size (1 when it fits 64 bits). The table is the host's to clear. */
static int configure(int cols, int rows) {
  COLS = cols;
  ROWS = rows;
  BOTTOM = 0;
  BOARD = 0;
  STRIDE = ROWS + 1;
  CELLS = COLS * ROWS;
  if (STRIDE * COLS > 64) return 0;
  MIN_SCORE = -(CELLS >> 1) + 3;
  MAX_SCORE = ((CELLS + 1) >> 1) - 3;
  for (int c = 0; c < COLS; c++) {
    COL_MASK[c] = (((uint64_t)1 << ROWS) - 1) << (c * STRIDE);
    BOTTOM |= (uint64_t)1 << (c * STRIDE);
    BOARD |= COL_MASK[c];
  }
  /* Centre first, then outwards (left before right on ties) — as in TS. */
  for (int c = 0; c < COLS; c++) ORDER[c] = c;
  for (int i = 0; i < COLS; i++)
    for (int j = i + 1; j < COLS; j++) {
      double di = ORDER[i] - (COLS - 1) / 2.0, dj = ORDER[j] - (COLS - 1) / 2.0;
      di = di < 0 ? -di : di;
      dj = dj < 0 ? -dj : dj;
      if (dj < di || (dj == di && ORDER[j] < ORDER[i])) {
        int t = ORDER[i];
        ORDER[i] = ORDER[j];
        ORDER[j] = t;
      }
    }
  return 1;
}

#endif
