/**
 * Pure board operations — the reference implementation the game machine runs.
 * Clear over fast: the AI plays on `fast/fast-board.ts`, and a parity test
 * holds the two to the same captures and legality.
 */

import { type Cell, type Color, EMPTY, IllegalMove, other, stoneOf } from "./types";

const neighborCache = new Map<number, readonly (readonly number[])[]>();

/** Orthogonal neighbours of every point on a `size`×`size` board. */
export function neighbors(size: number): readonly (readonly number[])[] {
  const cached = neighborCache.get(size);
  if (cached) return cached;
  const out: number[][] = [];
  for (let p = 0; p < size * size; p++) {
    const x = p % size;
    const y = Math.floor(p / size);
    const n: number[] = [];
    if (y > 0) n.push(p - size);
    if (x > 0) n.push(p - 1);
    if (x < size - 1) n.push(p + 1);
    if (y < size - 1) n.push(p + size);
    out.push(n);
  }
  neighborCache.set(size, out);
  return out;
}

export interface Group {
  readonly color: Color;
  readonly stones: number[];
  readonly liberties: number[];
}

/** The chain of stones through `point` and its liberties; `null` on an empty point. */
export function groupAt(board: readonly Cell[], size: number, point: number): Group | null {
  const cell = board[point];
  if (cell === undefined || cell === EMPTY) return null;
  const adj = neighbors(size);
  const seen = new Set<number>([point]);
  const libs = new Set<number>();
  const stones: number[] = [];
  const stack = [point];
  while (stack.length > 0) {
    const p = stack.pop() as number;
    stones.push(p);
    for (const q of adj[p] ?? []) {
      const c = board[q];
      if (c === EMPTY) libs.add(q);
      else if (c === cell && !seen.has(q)) {
        seen.add(q);
        stack.push(q);
      }
    }
  }
  return { color: (cell - 1) as Color, stones, liberties: [...libs] };
}

export interface Placement {
  readonly board: Cell[];
  readonly captured: number[];
}

/**
 * Put a stone of `color` on `point`, removing captured opponent chains.
 * Throws `IllegalMove` for an occupied point or a suicide (suicide is illegal
 * under the rules this game uses). Superko is the caller's business.
 */
export function placeStone(
  board: readonly Cell[],
  size: number,
  point: number,
  color: Color,
): Placement {
  if (!Number.isInteger(point) || point < 0 || point >= size * size) {
    throw new IllegalMove("off-board", point);
  }
  if (board[point] !== EMPTY) throw new IllegalMove("occupied", point);
  const next = board.slice() as Cell[];
  next[point] = stoneOf(color);
  const enemy = stoneOf(other(color));
  const captured: number[] = [];
  for (const q of neighbors(size)[point] ?? []) {
    if (next[q] !== enemy) continue;
    const g = groupAt(next, size, q);
    if (g && g.liberties.length === 0) {
      for (const s of g.stones) {
        next[s] = EMPTY;
        captured.push(s);
      }
    }
  }
  if (captured.length === 0) {
    const own = groupAt(next, size, point);
    if (own && own.liberties.length === 0) throw new IllegalMove("suicide", point);
  }
  return { board: next, captured };
}

/** An empty `size`×`size` board. */
export function emptyBoard(size: number): Cell[] {
  return new Array<Cell>(size * size).fill(EMPTY);
}
