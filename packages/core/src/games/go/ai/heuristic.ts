/**
 * Pebble — the Easy bot. One ply of plain Go sense on the fast board: take
 * stones in atari, rescue its own, don't self-atari, prefer the third and
 * fourth lines early and play near the action; jitter keeps it from repeating.
 */

import type { Rng } from "../../../lib/rng";
import { F_EMPTY, type FastBoard } from "../fast/fast-board";

/** Padded move for the side to move, or -1 to pass. */
export function heuristicMove(fb: FastBoard, rng: Rng, allowed?: ReadonlySet<number>): number {
  const moves = fb.sensibleMoves().filter((p) => !allowed || allowed.has(p));
  if (moves.length === 0) return -1;
  const me = fb.toMove + 1;
  const enemy = 3 - me;
  const opening = fb.moveCount < (fb.size * fb.size) / 4;
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const p of moves) {
    let score = rng() * 6;
    const seen = new Set<number>();
    for (const d of fb.dirs) {
      const q = p + d;
      const c = fb.cells[q];
      if (c !== me && c !== enemy) continue;
      const r = fb.root[q] as number;
      if (seen.has(r)) continue;
      seen.add(r);
      const size = fb.chainSize[r] as number;
      if (fb.inAtari(r)) score += c === enemy ? 60 + 25 * size : 40 + 20 * size;
    }
    const after = fb.clone();
    const captured = after.play(p);
    const r = after.root[p] as number;
    if (after.inAtari(r) && captured === 0) score -= 30 + 10 * (after.chainSize[r] as number);
    for (const d of fb.dirs) {
      const q = p + d;
      if (after.cells[q] === enemy && after.inAtari(after.root[q] as number)) score += 8;
    }
    // Lines, counted from the nearest edge (1 = edge).
    const x = (p % fb.w) - 1;
    const y = Math.floor(p / fb.w) - 1;
    const line = Math.min(x, y, fb.size - 1 - x, fb.size - 1 - y) + 1;
    if (opening) {
      if (line === 3 || line === 4) score += 6;
      if (line <= 2) score -= 8;
    } else if (line === 1) score -= 3;
    if (fb.lastMove >= 0) {
      const lx = (fb.lastMove % fb.w) - 1;
      const ly = Math.floor(fb.lastMove / fb.w) - 1;
      const dist = Math.abs(lx - x) + Math.abs(ly - y);
      if (dist <= 2) score += 4;
    }
    // Filling a point with no empty neighbours late in the game is rarely useful.
    if (!opening && fb.dirs.every((d) => fb.cells[p + d] !== F_EMPTY) && captured === 0) score -= 4;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}
