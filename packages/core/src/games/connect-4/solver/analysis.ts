/**
 * Position evaluation and move grading for hints, the evaluation bar,
 * post-game analysis and the Perfect bot. Exact wherever the solver finishes
 * inside its budget: the whole of 6×5 and 7×6 (their opening books cover the
 * start), 8×7 from the middle game on. PopOut is never solved — its positions
 * can repeat, which the solver can't model — so it gets the deep search's
 * suggestion with no verdict.
 */

import { createRng, type Rng } from "../../../lib/rng";
import { searchBestMove } from "../search/alphabeta";
import { SearchBoard } from "../search/board";
import type { Board, MoveRecord, Seat } from "../types";
import { BitSolver, BudgetExceeded, discsToWin } from "./bitboard-solver";
import { bookDepth, openingBook } from "./book";
import { wasmEngine } from "./wasm-engine";

export interface PositionInput {
  cols: number;
  rows: number;
  popOut: boolean;
  board: Board;
  toMove: Seat;
}

/** What the evaluation knows about a position, from the side to move's view. */
export type Verdict =
  | { kind: "win"; discs: number } // the side to move wins with its `discs`-th disc from now (0 = not counted)
  | { kind: "loss"; discs: number } // the opponent wins with its `discs`-th disc from now (0 = not counted)
  | { kind: "draw" }
  | { kind: "unknown" };

/** Why a position has no verdict. */
export type UnsolvedReason =
  /** PopOut: positions can repeat, so the solver doesn't apply. */
  | "popout"
  /** Earlier than the solver can reach on this board (8×7's opening). */
  | "too-early"
  /** In reach, but this position outran the node budget. */
  | "budget";

export interface SolverMove {
  type: "drop" | "pop";
  column: number;
}

export type PositionEval =
  | {
      solved: true;
      verdict: Verdict;
      /** True when the verdict counts discs; false when it is only win / draw / loss. */
      exact: boolean;
      /** Every move that keeps the verdict. */
      best: SolverMove[];
    }
  | {
      solved: false;
      reason: UnsolvedReason;
      /** The deep search's suggestion (empty when no search was asked for). */
      best: SolverMove[];
    };

const solvers = new Map<string, BitSolver>();

/**
 * One solver per board size, its table kept warm from position to position,
 * searching on the WebAssembly engine where it runs (its own table then does
 * the work; the JS one only serves the book's depths).
 */
export function solverFor(cols: number, rows: number): BitSolver {
  const key = `${cols}x${rows}`;
  let solver = solvers.get(key);
  if (!solver) {
    const engine = wasmEngine(cols, rows);
    solver = new BitSolver(cols, rows, engine ? 16 : 22);
    solver.attachEngine(engine);
    solvers.set(key, solver);
  }
  // A book may have finished loading since the solver was made.
  solver.attachBook(openingBook(cols, rows), bookDepth(cols, rows));
  return solver;
}

/**
 * Discs on the board from which the solver usually finishes inside a
 * decision's budget with no book (measured, ~4M nodes a second). Before
 * this, and past the board's book, it isn't tried.
 */
const SEARCH_REACH: Record<string, number> = { "6x5": 0, "7x6": 8, "8x7": 14 };

export function searchReach(cols: number, rows: number): number {
  return SEARCH_REACH[`${cols}x${rows}`] ?? 0;
}

export function solverInReach(cols: number, rows: number, discs: number): boolean {
  return discs <= bookDepth(cols, rows) || discs >= searchReach(cols, rows);
}

/** Whether (and why not) the solver can answer a position with `discs` discs. */
export function solverSupport(
  cols: number,
  rows: number,
  popOut: boolean,
  discs: number,
): "ok" | Exclude<UnsolvedReason, "budget"> {
  if (popOut) return "popout";
  return solverInReach(cols, rows, discs) ? "ok" : "too-early";
}

function discCount(board: Board): number {
  let n = 0;
  for (const col of board) for (const v of col) if (v !== null) n++;
  return n;
}

function verdictOf(score: number, exact: boolean, cells: number, moves: number): Verdict {
  if (score === 0) return { kind: "draw" };
  if (!exact) return score > 0 ? { kind: "win", discs: 0 } : { kind: "loss", discs: 0 };
  const discs = discsToWin(score, cells, moves) ?? 0;
  return score > 0 ? { kind: "win", discs } : { kind: "loss", discs };
}

/** The loaded position's score: exact inside `budget / 2` nodes, else win/draw/loss inside `budget`. */
function solveLoaded(
  solver: BitSolver,
  budget: number,
  modes: readonly boolean[],
): { score: number; weak: boolean } | null {
  const position = [
    solver.posLo,
    solver.posHi,
    solver.maskLo,
    solver.maskHi,
    solver.moves,
  ] as const;
  for (const weak of modes) {
    [solver.posLo, solver.posHi, solver.maskLo, solver.maskHi, solver.moves] = position;
    solver.nodes = 0;
    solver.nodeBudget = weak ? budget : budget / 2;
    try {
      return { score: solver.solve(weak), weak };
    } catch (err) {
      if (!(err instanceof BudgetExceeded)) throw err;
    }
  }
  return null;
}

/** The columns keeping `score`, inside a fresh `budget` (null if it runs out). */
function bestColumnsWithin(
  solver: BitSolver,
  score: number,
  weak: boolean,
  budget: number,
): number[] | null {
  solver.nodes = 0;
  solver.nodeBudget = budget;
  try {
    return solver.bestColumns(score, weak);
  } catch (err) {
    if (!(err instanceof BudgetExceeded)) throw err;
    return null;
  }
}

/** The columns reaching `target`, inside a fresh `budget` (null if it runs out). */
function columnsReachingWithin(solver: BitSolver, target: number, budget: number): number[] | null {
  solver.nodes = 0;
  solver.nodeBudget = budget;
  try {
    return solver.columnsReaching(target);
  } catch (err) {
    if (!(err instanceof BudgetExceeded)) throw err;
    return null;
  }
}

/**
 * The best columns for a solved score: exact if the budget allows, else the
 * columns that keep the result (win / draw) — far cheaper, since a book can
 * answer a position instantly whose children still need a real search.
 */
function bestColumnsFor(solver: BitSolver, solved: Solved, budget: number): number[] | null {
  const exact = solved.weak ? null : bestColumnsWithin(solver, solved.score, false, budget);
  return exact ?? bestColumnsWithin(solver, Math.sign(solved.score), true, budget);
}

/** The node-budgeted search's move, for when the solver can't name one (none without a search). */
function suggest(
  input: PositionInput,
  search: { nodeBudget: number; rng: Rng } | null,
): SolverMove[] {
  if (search === null) return [];
  const { cols, rows, popOut, board, toMove } = input;
  const sb = new SearchBoard(cols, rows, popOut, toMove);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows && board[c][r] !== null; r++) {
      sb.cells[c * rows + r] = board[c][r] as Seat;
      sb.heights[c] = r + 1;
    }
  }
  const move = searchBestMove(sb, { maxDepth: 20, ...search }).move;
  return [move < cols ? { type: "drop", column: move } : { type: "pop", column: move - cols }];
}

const DEFAULT_SEARCH = { nodeBudget: 600_000, rng: createRng(1) };

/**
 * Evaluate a position within `nodeBudget` solver nodes: exact first, then
 * win/draw/loss (`weakOnly` skips the exact attempt — a quick first answer).
 * When the solver can't answer, or can't name its best columns in budget,
 * `search` (if given) suggests a move — so with a search, `best` is never
 * empty while a move is legal.
 */
export function evaluatePosition(
  input: PositionInput,
  nodeBudget: number,
  search: { nodeBudget: number; rng: Rng } | null = DEFAULT_SEARCH,
  weakOnly = false,
): PositionEval {
  const { cols, rows, popOut, board, toMove } = input;
  const support = solverSupport(cols, rows, popOut, discCount(board));
  if (support === "ok") {
    const solver = solverFor(cols, rows);
    solver.setBoard(board, toMove);
    const solved = solveLoaded(solver, nodeBudget, weakOnly ? [true] : [false, true]);
    if (solved) {
      const columns = bestColumnsFor(solver, solved, nodeBudget);
      return {
        solved: true,
        verdict: verdictOf(solved.score, !solved.weak, cols * rows, solver.moves),
        exact: !solved.weak,
        best: columns?.map((column) => ({ type: "drop", column })) ?? suggest(input, search),
      };
    }
  }
  const reason = support === "ok" ? "budget" : support;
  return { solved: false, reason, best: suggest(input, search) };
}

/** Within this many discs of the result, only the best move will do. */
export const SURE_DISCS = 2;

/**
 * Is a move scoring `score` as good as the best (`best`, the position's own
 * score)? The best itself, or one point (one disc) below it — a win a disc
 * later, a defence a disc shorter — unless the result is `SURE_DISCS` discs
 * away or nearer (`discs`). Never a change of result. The Perfect bot plays
 * by it (`nearBestMoves`) and grading forgives by it (`gradeFromScores`).
 */
export function nearBest(best: number, score: number, discs: number): boolean {
  if (score === best) return true;
  return (
    best !== 0 && discs > SURE_DISCS && score === best - 1 && Math.sign(score) === Math.sign(best)
  );
}

/**
 * The moves a player who never misplays might pick: every move as good as
 * the best give or take one disc — a win one disc later, a defence one disc
 * shorter — unless the result is `SURE_DISCS` away or nearer, when only the
 * best will do. In a draw, every drawing move. Never a move that changes
 * the result. Where the solver can't be that precise, `evaluatePosition`'s
 * best moves (and its search's suggestion).
 */
export function nearBestMoves(
  input: PositionInput,
  nodeBudget: number,
  search: { nodeBudget: number; rng: Rng } | null = DEFAULT_SEARCH,
): SolverMove[] {
  const { cols, rows, popOut, board, toMove } = input;
  if (solverSupport(cols, rows, popOut, discCount(board)) === "ok") {
    const solver = solverFor(cols, rows);
    solver.setBoard(board, toMove);
    const solved = solveLoaded(solver, nodeBudget, [false]);
    const discs = solved ? (discsToWin(solved.score, cols * rows, solver.moves) ?? 0) : 0;
    if (solved && solved.score !== 0 && discs > SURE_DISCS) {
      // `nearBest`: a disc slower is one point lower, for a win (never below a win) and a loss alike.
      const target = solved.score > 0 ? Math.max(1, solved.score - 1) : solved.score - 1;
      const columns = columnsReachingWithin(solver, target, nodeBudget);
      if (columns && columns.length > 0) return columns.map((column) => ({ type: "drop", column }));
    }
  }
  return evaluatePosition(input, nodeBudget, search).best;
}

/**
 * What dropping in each column leads to, from the mover's view (a win counts
 * the mover's discs from now, the drop included), or null for a full column.
 * Each column gets its own `nodeBudget`: exact if it fits, else win / draw /
 * loss, else unknown. `onColumn` hears each column as it is answered (one can
 * take a second just past a book). Drop-only boards; a position out of the
 * solver's reach answers unknown for every open column.
 */
export function evaluateColumns(
  input: PositionInput,
  nodeBudget: number,
  onColumn?: (column: number, verdict: Verdict | null) => void,
): (Verdict | null)[] {
  const { cols, rows, popOut, board, toMove } = input;
  const cells = cols * rows;
  const discs = discCount(board);
  const solver = solverFor(cols, rows);
  solver.setBoard(board, toMove);
  const parent = [solver.posLo, solver.posHi, solver.maskLo, solver.maskHi, solver.moves] as const;
  const inReach = !popOut && solverInReach(cols, rows, discs + 1);
  const out: (Verdict | null)[] = [];
  const answer = (column: number, verdict: Verdict | null) => {
    out.push(verdict);
    onColumn?.(column, verdict);
  };
  for (let c = 0; c < cols; c++) {
    [solver.posLo, solver.posHi, solver.maskLo, solver.maskHi, solver.moves] = parent;
    if (!solver.canPlay(c)) {
      answer(c, null);
      continue;
    }
    if (!popOut && solver.isWinningMove(c)) {
      answer(c, verdictOf((cells + 1 - discs) >> 1, true, cells, discs));
      continue;
    }
    if (!inReach) {
      answer(c, { kind: "unknown" });
      continue;
    }
    solver.playColumn(c);
    const child =
      solver.moves >= cells
        ? { score: 0, weak: false }
        : solveLoaded(solver, nodeBudget, [false, true]);
    answer(c, child ? verdictOf(-child.score, !child.weak, cells, discs) : { kind: "unknown" });
  }
  [solver.posLo, solver.posHi, solver.maskLo, solver.maskHi, solver.moves] = parent;
  return out;
}

// ── Grading ─────────────────────────────────────────────────────────────────

export type Grade = "best" | "good" | "inaccuracy" | "mistake" | "blunder" | "unknown";

export interface MoveGrade {
  /** Index into the game's moves. */
  index: number;
  player: Seat;
  column: number;
  grade: Grade;
  /** The verdict before the move and after it, both from the mover's view. */
  before: Verdict;
  after: Verdict;
  /** The columns that were best (empty when unknown). */
  bestColumns: number[];
}

/** A solved score of a position (side to move's view). */
interface Solved {
  score: number;
  weak: boolean;
}

/**
 * Grade a move from the score before it and the score it left (both the
 * mover's view): losing the result class is a blunder (win → loss) or a
 * mistake (win → draw, draw → loss). Keeping it is best; good when one disc
 * off the best (`nearBest`, given `discs` to the result before the move) or
 * when only the result is known; an inaccuracy for a win slower, or a loss
 * sooner, by more.
 */
export function gradeFromScores(before: Solved, after: Solved, discs = 0): Grade {
  if (Math.sign(after.score) === Math.sign(before.score)) {
    if (before.weak || after.weak) return "good";
    if (after.score === before.score) return "best";
    return nearBest(before.score, after.score, discs) ? "good" : "inaccuracy";
  }
  const drop = Math.sign(before.score) - Math.sign(after.score);
  if (drop >= 2) return "blunder";
  if (drop === 1) return "mistake";
  return "inaccuracy";
}

/**
 * Grade every move of a finished drop-only game, last move first (late
 * positions solve fastest and warm the table for earlier ones). Each
 * position is solved once: the score a move left is the next position's
 * score, negated. `onGrade` hears each grade as it lands; returns them all
 * in move order.
 *
 * `range` grades only moves `from` (inclusive) to `to` (exclusive), so a
 * caller can grade a long game in slices and answer other questions in
 * between; each slice solves position `to` once more (its table is warm).
 */
export function gradeGame(
  cols: number,
  rows: number,
  moves: readonly MoveRecord[],
  nodeBudget: number,
  onGrade?: (grade: MoveGrade) => void,
  range: { from: number; to: number } = { from: 0, to: moves.length },
): MoveGrade[] {
  if (moves.some((m) => m.type !== "drop")) throw new Error("Only drop-only games can be graded");
  const cells = cols * rows;
  const solver = solverFor(cols, rows);
  const solveAt = (discs: number): Solved | null => {
    if (!solverInReach(cols, rows, discs)) return null;
    solver.setMoves(moves.slice(0, discs).map((m) => m.column));
    return solveLoaded(solver, nodeBudget, [false, true]);
  };

  // The score after the slice's last move. At the game's end: it ended
  // there (four, a full board), or it was resigned with play still open.
  const n = moves.length;
  const from = Math.max(0, range.from);
  const to = Math.min(n, range.to);
  let next: Solved | null = null;
  if (to < n) next = solveAt(to);
  else if (n > 0) {
    if (endsWithFour(solver, moves)) next = { score: -((cells + 1 - (n - 1)) >> 1), weak: false };
    else if (n >= cells) next = { score: 0, weak: false };
    else next = solveAt(n);
  }

  const grades: MoveGrade[] = [];
  for (let i = to - 1; i >= from; i--) {
    const move = moves[i];
    const before = solveAt(i);
    // The mover's view of what the move left: the next position's score, negated.
    const after = next === null ? null : { score: -next.score, weak: next.weak };
    let grade: MoveGrade = {
      index: i,
      player: move.player,
      column: move.column,
      grade: "unknown",
      before: { kind: "unknown" },
      after: { kind: "unknown" },
      bestColumns: [],
    };
    if (before !== null) {
      // `solveAt` left the solver on this position.
      grade = {
        ...grade,
        before: verdictOf(before.score, !before.weak, cells, i),
        bestColumns: bestColumnsFor(solver, before, nodeBudget) ?? [],
      };
      if (after !== null) {
        grade = {
          ...grade,
          grade: gradeFromScores(before, after, discsToWin(before.score, cells, i) ?? 0),
          after: verdictOf(after.score, !after.weak, cells, i),
        };
      }
    }
    grades.unshift(grade);
    onGrade?.(grade);
    next = before;
  }
  return grades;
}

/** Did the game's last drop complete four? (Loads the position before it.) */
function endsWithFour(solver: BitSolver, moves: readonly MoveRecord[]): boolean {
  solver.setMoves(moves.slice(0, -1).map((m) => m.column));
  return solver.isWinningMove(moves[moves.length - 1].column);
}
