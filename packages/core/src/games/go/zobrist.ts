/**
 * Zobrist keys for positional superko. Two independent 32-bit halves per
 * (point, colour) — 64 bits together, rendered as hex so a key is JSON-safe.
 * The tables come from a fixed seed: keys are stable across processes and
 * releases, so a stored game's history stays valid.
 */

import { createRng } from "../../lib/rng";
import { type Cell, EMPTY, MAX_SIZE } from "./types";

const POINTS = MAX_SIZE * MAX_SIZE;

function table(seed: number): Int32Array {
  const rng = createRng(seed);
  const t = new Int32Array(POINTS * 2);
  for (let i = 0; i < t.length; i++) t[i] = (rng() * 0x100000000) | 0;
  return t;
}

/** `[point * 2 + (stone - 1)]` for each half. */
export const ZOBRIST_HI = table(0x60b0a12d);
export const ZOBRIST_LO = table(0x1f3c5e77);

export function hashKey(hi: number, lo: number): string {
  return (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0");
}

/** The two raw halves of a whole board's key. */
export function boardHalves(board: readonly Cell[]): { hi: number; lo: number } {
  let hi = 0;
  let lo = 0;
  for (let p = 0; p < board.length; p++) {
    const cell = board[p];
    if (cell === EMPTY || cell === undefined) continue;
    const i = p * 2 + cell - 1;
    hi ^= ZOBRIST_HI[i] ?? 0;
    lo ^= ZOBRIST_LO[i] ?? 0;
  }
  return { hi, lo };
}

/** The key of a whole board. */
export function hashBoard(board: readonly Cell[]): string {
  const { hi, lo } = boardHalves(board);
  return hashKey(hi, lo);
}
