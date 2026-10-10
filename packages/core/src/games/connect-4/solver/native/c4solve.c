/*
 * Native Connect 4 solver for building opening books — the same algorithm as
 * bitboard-solver.ts (Pascal Pons' scheme: 64-bit bitboard, negamax with
 * alpha-beta, null-window search on the score, only non-losing moves,
 * threat-ordered moves, transposition table), with real 64-bit integers so it
 * runs several times faster than the JS pair-of-halves version.
 *
 *   c4solve <cols> <rows>  < positions  > scores
 *
 * Each input line is a move sequence (column digits, 0-based, e.g. "3324");
 * each output line is the exact score of that position, side to move's view,
 * in Pons' units (bitboard-solver.ts's `solve()`). Lines stay in order.
 *
 * Build: gcc -O3 -march=native -o c4solve c4solve.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "c4core.h"

#define TT_BITS 24

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: c4solve <cols> <rows> < positions\n");
    return 2;
  }
  if (!configure(atoi(argv[1]), atoi(argv[2]))) {
    fprintf(stderr, "board does not fit 64 bits\n");
    return 2;
  }
  tt_bits = TT_BITS;
  tt_key = calloc((size_t)1 << TT_BITS, sizeof *tt_key);
  tt_val = calloc((size_t)1 << TT_BITS, sizeof *tt_val);
  if (!tt_key || !tt_val) return 3;

  char line[256];
  while (fgets(line, sizeof line, stdin)) {
    uint64_t p = 0, mask = 0;
    int nb = 0;
    for (char *s = line; *s >= '0' && *s <= '9'; s++) {
      int c = *s - '0';
      uint64_t m = possible(mask) & COL_MASK[c];
      p ^= mask;
      mask |= m;
      nb++;
    }
    /* `p` must be the side to move's discs: after each move we flipped
       before adding, so p currently holds the side to move's discs. */
    nodes = 0;
    printf("%d\n", solve(p, mask, nb));
    fflush(stdout);
  }
  return 0;
}
