/**
 * The AI ladder: Blocker, Lookahead, Deep Search and Perfect. Every
 * random choice draws from `decisionRng(state)`, and every search is bounded by
 * nodes rather than time, so a seeded game replays move for move.
 *
 * Deep Search and Perfect can think for seconds; the server runs them on a
 * worker pool (`withConnect4AiOffload` in machine.ts), so they never block the
 * event loop. Everything here also runs inline (tests, the tournament CLI).
 * Perfect reads the opening books when they're loaded (`loadOpeningBooks`) —
 * the server's workers and the CLI load them; without them it searches.
 */

import { createRng, type Rng } from "../../lib/rng";
import { searchBestMove } from "./search/alphabeta";
import { EMPTY, SearchBoard } from "./search/board";
import { nearBestMoves } from "./solver/analysis";
import type { Action, AIStrategy, AIStrategyId, GameState, Seat } from "./types";

/** Search budgets, in nodes. */
export const AI_BUDGETS = {
  lookahead: { maxDepth: 6, nodeBudget: 400_000 },
  deep: { maxDepth: 20, nodeBudget: 800_000 },
  /**
   * Perfect's solver budget per decision (exact, then win/draw/loss only);
   * past it, the deep search decides. ~3.5M nodes a second.
   */
  perfectSolverNodes: 4_000_000,
};

/** Keyed on the seed and the decision point, so a seeded game replays identically. */
export function decisionRng(state: GameState): Rng {
  const point = state.gameIndex * 1_000 + state.moves.length + 1;
  return createRng((state.seed ^ Math.imul(point, 0x2545f491)) | 0);
}

function toAction(board: SearchBoard, move: number): Action {
  return move < board.cols
    ? { type: "drop", column: move }
    : { type: "pop", column: move - board.cols };
}

function discActions(legal: Action[]): Action[] {
  return legal.filter((a) => a.type === "drop" || a.type === "pop");
}

/**
 * Win now if possible; else stop the opponent's immediate win; never make a
 * move that hands the opponent one; else lean towards the centre.
 */
function pickBlocker(state: GameState): Action {
  const board = SearchBoard.fromState(state);
  const moves = new Int32Array(board.cols * 2);
  const n = board.moves(moves);
  const me = board.toMove;
  const safe: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = moves[i];
    const won = board.play(m);
    if (won === me) {
      board.undo(m);
      return toAction(board, m);
    }
    const handsWin = won !== EMPTY || opponentCanWin(board);
    board.undo(m);
    if (!handsWin) safe.push(m);
  }
  const pool = safe.length > 0 ? safe : Array.from(moves.subarray(0, n));
  const rng = decisionRng(state);
  // Centre-weighted: closer columns are likelier.
  const centre = (board.cols - 1) / 2;
  const weights = pool.map((m) => {
    const c = m < board.cols ? m : m - board.cols;
    return board.cols - Math.abs(c - centre);
  });
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return toAction(board, pool[i]);
  }
  return toAction(board, pool[pool.length - 1]);
}

/** Can the side to move win with one disc move? */
function opponentCanWin(board: SearchBoard): boolean {
  const moves = new Int32Array(board.cols * 2);
  const n = board.moves(moves);
  const who = board.toMove;
  for (let i = 0; i < n; i++) {
    const won = board.play(moves[i]);
    board.undo(moves[i]);
    if (won === who) return true;
  }
  return false;
}

function pickSearch(state: GameState, budget: { maxDepth: number; nodeBudget: number }): Action {
  const board = SearchBoard.fromState(state);
  const result = searchBestMove(board, { ...budget, rng: decisionRng(state) });
  return toAction(board, result.move);
}

// ── Perfect ─────────────────────────────────────────────────────────────────

/**
 * Never misplays, but isn't predictable: any move within a disc of the best
 * (a win one disc later, a defence one disc shorter; only the best when the
 * result is two discs away), drawn uniformly at random — so every game goes
 * its own way. Never a move that changes the result.
 */
function pickPerfect(state: GameState, legal: Action[]): Action {
  const rng = decisionRng(state);
  const candidates = nearBestMoves(
    {
      cols: state.cols,
      rows: state.rows,
      popOut: state.config.popOut,
      board: state.board,
      toMove: state.currentPlayer,
    },
    AI_BUDGETS.perfectSolverNodes,
    { nodeBudget: AI_BUDGETS.deep.nodeBudget, rng },
  );
  const pick = candidates[Math.floor(rng() * candidates.length)];
  const moves = discActions(legal);
  return (
    moves.find(
      (a) =>
        (a.type === "drop" || a.type === "pop") &&
        a.type === pick?.type &&
        a.column === pick.column,
    ) ?? moves[0]
  );
}

const strategies: Record<AIStrategyId, AIStrategy> = {
  blocker: { pickAction: pickBlocker },
  lookahead: { pickAction: (state) => pickSearch(state, AI_BUDGETS.lookahead) },
  deep: { pickAction: (state) => pickSearch(state, AI_BUDGETS.deep) },
  perfect: { pickAction: pickPerfect },
};

export function getStrategy(id: AIStrategyId): AIStrategy {
  return strategies[id];
}

/** Strategies that think long enough to belong on a worker thread. */
export const HEAVY_STRATEGIES: ReadonlySet<AIStrategyId> = new Set(["deep", "perfect"]);

/** The AI seat to move's action. Throws if it isn't an AI's turn. */
export function pickAiAction(state: GameState, legal: Action[]): Action {
  const seat: Seat = state.currentPlayer;
  const id = state.strategies[seat];
  if (!id) throw new Error("Not an AI's turn");
  return getStrategy(id).pickAction(state, legal, seat);
}

/** Runs a heavy decision somewhere else (the server's worker pool). */
export type AiOffload = (state: GameState) => Promise<Action>;
