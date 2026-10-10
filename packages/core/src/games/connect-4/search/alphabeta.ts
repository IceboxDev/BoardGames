/**
 * Depth-limited negamax with alpha-beta and iterative deepening over a
 * `SearchBoard`, for every board size and PopOut. The budget is a node count,
 * not a clock, so a seeded game replays move for move on any machine.
 */

import type { Rng } from "../../../lib/rng";
import { EMPTY, type SearchBoard, WIN_SCORE } from "./board";

export interface SearchOptions {
  /** Deepest iteration, in plies. */
  maxDepth: number;
  /** Stop after this many nodes; the last finished iteration's move stands. */
  nodeBudget: number;
  /** Breaks ties between equally good root moves. */
  rng: Rng;
}

export interface SearchResult {
  move: number;
  score: number;
  depth: number;
  nodes: number;
}

class BudgetExceeded extends Error {}

export function searchBestMove(board: SearchBoard, options: SearchOptions): SearchResult {
  const root = new Int32Array(board.cols * 2);
  const count = board.moves(root);
  if (count === 0) throw new Error("No moves to search");
  // A seeded shuffle, then a stable sort by the board's centre-first order,
  // so equal moves are tried (and therefore chosen) in a varied order.
  let moves = Array.from(root.subarray(0, count));
  moves = shuffleWithin(moves, options.rng);

  let nodes = 0;
  const bufs: Int32Array[] = [];
  const buf = (ply: number) => {
    while (bufs.length <= ply) bufs.push(new Int32Array(board.cols * 2));
    return bufs[ply];
  };

  const negamax = (depth: number, alpha: number, beta: number, ply: number): number => {
    if (++nodes > options.nodeBudget) throw new BudgetExceeded();
    const list = buf(ply);
    const n = board.moves(list);
    if (n === 0) return 0;
    if (depth === 0) return board.evaluate();
    const mover = board.toMove;
    // Any immediate win ends the search here.
    for (let i = 0; i < n; i++) {
      const won = board.play(list[i]);
      board.undo(list[i]);
      if (won === mover) return WIN_SCORE - board.ply - 1;
    }
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      const m = list[i];
      const won = board.play(m);
      const score =
        won === EMPTY
          ? -negamax(depth - 1, -beta, -alpha, ply + 1)
          : won === mover
            ? WIN_SCORE - board.ply
            : -(WIN_SCORE - board.ply);
      board.undo(m);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  };

  let result: SearchResult = { move: moves[0], score: 0, depth: 0, nodes: 0 };
  for (let depth = 1; depth <= options.maxDepth; depth++) {
    let bestMove = moves[0];
    let bestScore = -Infinity;
    try {
      const mover = board.toMove;
      for (const m of moves) {
        const won = board.play(m);
        let score: number;
        try {
          score =
            won === EMPTY
              ? -negamax(depth - 1, -Infinity, -bestScore, 1)
              : won === mover
                ? WIN_SCORE - board.ply
                : -(WIN_SCORE - board.ply);
        } finally {
          board.undo(m);
        }
        if (score > bestScore) {
          bestScore = score;
          bestMove = m;
        }
      }
    } catch (err) {
      if (err instanceof BudgetExceeded) break;
      throw err;
    }
    result = { move: bestMove, score: bestScore, depth, nodes };
    // Best move first next iteration; a forced result needs no deeper look.
    moves = [bestMove, ...moves.filter((m) => m !== bestMove)];
    if (Math.abs(bestScore) > WIN_SCORE / 2) break;
  }
  result.nodes = nodes;
  return result;
}

/** Shuffle, then restore centre-first order between moves of different priority. */
function shuffleWithin(moves: number[], rng: Rng): number[] {
  const keyed = moves.map((m, i) => ({ m, i, r: rng() }));
  // Original index is the priority (centre first); only near-equal columns mix.
  keyed.sort((a, b) => Math.floor(a.i / 2) - Math.floor(b.i / 2) || a.r - b.r);
  return keyed.map((k) => k.m);
}
