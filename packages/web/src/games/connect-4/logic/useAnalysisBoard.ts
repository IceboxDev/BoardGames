/**
 * The analysis board's state: which position is shown, a what-if side line
 * played from it, and the "learn from your mistakes" walk. A reducer over the
 * game, so every rule is a pure, tested function; `derive` turns the state
 * into what the board draws and the position the solver is asked about.
 *
 * Ply `p` is the position after `p` of the game's moves (0 = empty board).
 */

import {
  boardAfter,
  columnHeight,
  linesThrough,
  other,
} from "@boardgames/core/games/connect-4/rules";
import type { PositionInput } from "@boardgames/core/games/connect-4/solver/analysis";
import type { Board, Cell, MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { useMemo, useReducer } from "react";

export interface BoardGame {
  cols: number;
  rows: number;
  firstPlayer: Seat;
  moves: readonly MoveRecord[];
  /** The game ended in four on its last move (nothing can be played from the end). */
  endedInFour: boolean;
}

export interface Practice {
  /** The moves to retry (indexes into the game's moves), in game order. */
  queue: readonly number[];
  /** Which one is up; `queue.length` once all are done. */
  at: number;
  /** Columns tried on the current one that didn't keep the result (the board stays put). */
  tried: readonly number[];
  /** The latest answer's column, for its feedback. */
  last: number | null;
  /** How the current one was answered: a column that kept the result (drawn in), or not yet. */
  solved: "best" | "keeps" | null;
  /** The answer is shown after two misses. */
  revealed: boolean;
  /** Retries answered before the reveal. */
  found: number;
}

export interface AnalysisState {
  ply: number;
  /** A side line from `ply`: the columns played, in order. */
  line: readonly number[];
  practice: Practice | null;
}

export type AnalysisAction =
  | { type: "go"; ply: number }
  | { type: "step"; by: 1 | -1 }
  | { type: "play"; column: number }
  | { type: "undo" }
  | { type: "leave-line" }
  | { type: "practice"; queue: readonly number[] }
  | { type: "answer"; column: number; result: "best" | "keeps" | "misses" }
  | { type: "next" }
  | { type: "stop-practice" };

/** Practice reveals the answer after this many wrong columns. */
export const MISSES_BEFORE_REVEAL = 2;

export function initialAnalysis(game: BoardGame): AnalysisState {
  return { ply: game.moves.length, line: [], practice: null };
}

/** What the board shows for a state. */
export interface Shown {
  /** The game's moves up to the ply, then the side line's. */
  moves: MoveRecord[];
  board: Board;
  toMove: Seat;
  /** Where a side line ended: four in a row (its cells), or a full board. */
  lineEnd: { kind: "four"; cells: Cell[] } | { kind: "full" } | null;
  /** Columns a disc may be dropped into now (side lines and practice). */
  open: number[];
  /** The solver's question about the position, or null when nothing is left to play. */
  position: PositionInput | null;
  /** The same for the game's position at the ply, before any side line (practice judges it). */
  base: PositionInput | null;
}

/** The colour to move after `moves` (the game's first player when none). */
function nextMover(firstPlayer: Seat, moves: readonly MoveRecord[]): Seat {
  const last = moves.at(-1);
  return last ? other(last.player) : firstPlayer;
}

export function derive(game: BoardGame, state: AnalysisState): Shown {
  const shown = deriveLine(game, state);
  return {
    ...shown,
    base:
      state.line.length === 0 ? shown.position : deriveLine(game, { ...state, line: [] }).position,
  };
}

function deriveLine(game: BoardGame, state: AnalysisState): Omit<Shown, "base"> {
  const { cols, rows } = game;
  const moves = game.moves.slice(0, state.ply) as MoveRecord[];
  const board = boardAfter(cols, rows, moves);
  let lineEnd: Shown["lineEnd"] = null;
  for (const column of state.line) {
    const row = columnHeight(board, column);
    const player = nextMover(game.firstPlayer, moves);
    board[column][row] = player;
    moves.push({ type: "drop", column, row, player });
    const four = linesThrough(board, column, row);
    if (four.length > 0) lineEnd = { kind: "four", cells: four };
    else if (moves.length >= cols * rows) lineEnd = { kind: "full" };
  }
  const atGameEnd = state.line.length === 0 && state.ply === game.moves.length;
  const over = lineEnd !== null || (atGameEnd && game.endedInFour) || moves.length >= cols * rows;
  const toMove = nextMover(game.firstPlayer, moves);
  const open = over
    ? []
    : Array.from({ length: cols }, (_, c) => c).filter((c) => columnHeight(board, c) < rows);
  return {
    moves,
    board,
    toMove,
    lineEnd,
    open,
    position: over ? null : { cols, rows, popOut: false, board, toMove },
  };
}

const clamp = (ply: number, game: BoardGame) => Math.max(0, Math.min(game.moves.length, ply));

export function reduceAnalysis(
  state: AnalysisState,
  action: AnalysisAction,
  game: BoardGame,
): AnalysisState {
  const practice = state.practice;
  switch (action.type) {
    case "go":
      if (practice) return state;
      return { ...state, ply: clamp(action.ply, game), line: [] };
    case "step":
      if (practice) return state;
      if (state.line.length > 0) {
        return action.by < 0 ? { ...state, line: state.line.slice(0, -1) } : state;
      }
      return { ...state, ply: clamp(state.ply + action.by, game) };
    case "play":
      if (practice || !deriveLine(game, state).open.includes(action.column)) return state;
      return { ...state, line: [...state.line, action.column] };
    case "undo":
      return practice ? state : { ...state, line: state.line.slice(0, -1) };
    case "leave-line":
      return practice ? state : { ...state, line: [] };
    case "practice":
      if (action.queue.length === 0) return state;
      return {
        ply: clamp(action.queue[0], game),
        line: [],
        practice: {
          queue: action.queue,
          at: 0,
          tried: [],
          last: null,
          solved: null,
          revealed: false,
          found: 0,
        },
      };
    case "answer": {
      if (!practice || practice.solved || practice.at >= practice.queue.length) return state;
      if (action.result === "misses") {
        const tried = practice.tried.includes(action.column)
          ? practice.tried
          : [...practice.tried, action.column];
        return {
          ...state,
          practice: {
            ...practice,
            tried,
            last: action.column,
            revealed: tried.length >= MISSES_BEFORE_REVEAL,
          },
        };
      }
      return {
        ...state,
        line: [action.column],
        practice: {
          ...practice,
          last: action.column,
          solved: action.result,
          found: practice.revealed ? practice.found : practice.found + 1,
        },
      };
    }
    case "next": {
      if (!practice) return state;
      const at = practice.at + 1;
      const next = { ...practice, at, tried: [], last: null, solved: null, revealed: false };
      return at < practice.queue.length
        ? { ply: clamp(practice.queue[at], game), line: [], practice: next }
        : { ...state, line: [], practice: next };
    }
    case "stop-practice":
      return practice ? { ...state, line: [], practice: null } : state;
  }
}

/** The analysis board's state for one game (key the component by game to start over). */
export function useAnalysisBoard(game: BoardGame) {
  const [state, dispatch] = useReducer(
    (s: AnalysisState, a: AnalysisAction) => reduceAnalysis(s, a, game),
    game,
    initialAnalysis,
  );
  const shown = useMemo(() => derive(game, state), [game, state]);
  return { state, dispatch, shown };
}
