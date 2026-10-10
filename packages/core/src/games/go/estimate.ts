/**
 * Ownership by Monte Carlo: average who owns each point at the end of many
 * playouts from this position. Feeds the scoring phase's dead-stone proposal
 * (when KataGo isn't there to give one) and the TS AIs.
 */

import { createRng } from "../../lib/rng";
import { groupAt } from "./board";
import { FastBoard } from "./fast/fast-board";
import { EMPTY, type GoGame } from "./types";

/** Ownership per point in [-1, 1]: +1 surely Black's, -1 surely White's. */
export function estimateOwnership(game: GoGame, playouts = 600, seed = 1): number[] {
  const rng = createRng(seed);
  const base = FastBoard.fromGame(game);
  const acc = new Float64Array(game.size * game.size);
  const maxMoves = game.size * game.size * 3;
  for (let i = 0; i < playouts; i++) {
    const fb = base.clone();
    // Both sides passed to get here; play on as if they hadn't.
    fb.consecutivePasses = 0;
    fb.playout(rng, maxMoves);
    fb.ownershipInto(acc);
  }
  return Array.from(acc, (v) => v / playouts);
}

/**
 * Stones that `ownership` says belong to the other side — whole chains, by the
 * chain's mean ownership past `threshold`.
 */
export function deadStonesFrom(
  game: GoGame,
  ownership: readonly number[],
  threshold = 0.6,
): number[] {
  const dead: number[] = [];
  const seen = new Set<number>();
  for (let p = 0; p < game.board.length; p++) {
    if (game.board[p] === EMPTY || seen.has(p)) continue;
    const g = groupAt(game.board, game.size, p);
    if (!g) continue;
    for (const s of g.stones) seen.add(s);
    const mean = g.stones.reduce((sum, s) => sum + (ownership[s] ?? 0), 0) / g.stones.length;
    // Black stones (colour 0) are dead when the area is White's, and vice versa.
    const owner = g.color === 0 ? mean : -mean;
    if (owner < -threshold) dead.push(...g.stones);
  }
  return dead.sort((a, b) => a - b);
}

export function estimateDeadStones(game: GoGame, playouts = 600, seed = 1): number[] {
  return deadStonesFrom(game, estimateOwnership(game, playouts, seed));
}
