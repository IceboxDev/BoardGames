/**
 * The built-in chess AI: a small alpha-beta search (material + piece-square
 * tables, capture-only quiescence, MVV-LVA ordering). It plays the `random`
 * strategy, stands in whenever the server's Stockfish pool is unavailable, and
 * keeps tests independent of any engine binary. Club-beginner strength at
 * depth 3 — a safety net, not the product.
 */

import type { Rng } from "../../lib/rng";
import { applyMove } from "./engine/apply";
import { colorOf, inCheck, rankOf, typeOf } from "./engine/board";
import { legalMoves } from "./engine/movegen";
import type { Color, Move, PieceType, Position } from "./engine/types";

const VALUE: Readonly<Record<PieceType, number>> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

// Piece-square tables from White's side, a8 first (the usual print order);
// `pst()` flips the rank for lookups by a1 = 0 squares.
const PST: Readonly<Record<PieceType, readonly number[]>> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
};

function pst(type: PieceType, color: Color, sq: number): number {
  const rank = rankOf(sq);
  const file = sq & 7;
  // Table row 0 is rank 8 for White; Black reads the table mirrored.
  const row = color === "w" ? 7 - rank : rank;
  return PST[type][row * 8 + file] ?? 0;
}

/** Static evaluation in centipawns from the side to move's point of view. */
export function evaluate(pos: Position): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    const type = typeOf(p);
    const color = colorOf(p);
    const v = VALUE[type] + pst(type, color, sq);
    score += color === "w" ? v : -v;
  }
  if (pos.pockets) {
    for (const t of ["p", "n", "b", "r", "q"] as const) {
      // A piece in hand is worth a little more than on the board: it can go anywhere.
      score += (pos.pockets.w[t] - pos.pockets.b[t]) * Math.round(VALUE[t] * 1.1);
    }
  }
  return pos.turn === "w" ? score : -score;
}

const MATE = 100_000;

function victimValue(pos: Position, m: Move): number {
  if (m.drop !== undefined) return 0;
  const target = pos.board[m.to];
  const promo = m.promotion ? VALUE[m.promotion] : 0;
  if (!target) return promo;
  const attacker = pos.board[m.from];
  return VALUE[typeOf(target)] * 10 - (attacker ? VALUE[typeOf(attacker)] : 0) / 10 + promo;
}

function ordered(pos: Position, moves: Move[]): Move[] {
  return moves
    .map((m) => ({ m, s: victimValue(pos, m) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

interface Budget {
  nodes: number;
}

function quiesce(
  pos: Position,
  alpha: number,
  beta: number,
  budget: Budget,
  depth: number,
): number {
  budget.nodes -= 1;
  const stand = evaluate(pos);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (depth <= 0 || budget.nodes <= 0) return alpha;
  const captures = legalMoves(pos).filter(
    (m) => m.drop === undefined && (!!pos.board[m.to] || !!m.promotion),
  );
  for (const m of ordered(pos, captures)) {
    const score = -quiesce(applyMove(pos, m), -beta, -alpha, budget, depth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(
  pos: Position,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  budget: Budget,
): number {
  const moves = legalMoves(pos);
  if (moves.length === 0) return inCheck(pos) ? -MATE + ply : 0;
  if (depth <= 0) return quiesce(pos, alpha, beta, budget, 4);
  budget.nodes -= 1;
  for (const m of ordered(pos, moves)) {
    const score = -search(applyMove(pos, m), depth - 1, -beta, -alpha, ply + 1, budget);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
    if (budget.nodes <= 0) break;
  }
  return alpha;
}

export interface FallbackOptions {
  /** Plies of full-width search before quiescence. 0 plays at random. */
  readonly depth: number;
  /** Rough node cap so a busy position can't stall the event loop. */
  readonly maxNodes?: number;
  /** Centipawns of noise added per root move — weaker tiers blunder more. */
  readonly noise?: number;
  readonly rng: Rng;
}

/** The fallback AI's move for the side to move, or `null` when it has none. */
export function fallbackMove(pos: Position, opts: FallbackOptions): Move | null {
  const moves = legalMoves(pos);
  if (moves.length === 0) return null;
  if (opts.depth <= 0) return moves[Math.floor(opts.rng() * moves.length)] ?? null;

  const budget: Budget = { nodes: opts.maxNodes ?? 60_000 };
  let best: Move | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const m of ordered(pos, moves)) {
    const score =
      -search(applyMove(pos, m), opts.depth - 1, -MATE - 1, MATE + 1, 1, budget) +
      (opts.noise ? (opts.rng() - 0.5) * 2 * opts.noise : 0);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Static eval (centipawns) for `color` — how an AI decides whether to take a draw. */
export function evalFor(pos: Position, color: Color): number {
  const e = evaluate(pos);
  return pos.turn === color ? e : -e;
}
