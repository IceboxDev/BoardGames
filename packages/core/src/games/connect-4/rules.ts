/**
 * Connect 4 rules on the plain game state: legal actions, applying one, and
 * what ends a game and a series. Rulings are written down in RULES.md.
 */

import { createRng } from "../../lib/rng";
import { boardDimensions, type Connect4Config } from "./manifest";
import type {
  Action,
  AIStrategyId,
  Board,
  Cell,
  EndReason,
  GameState,
  MoveRecord,
  Seat,
} from "./types";

/** A PopOut game is a draw at this many moves — a backstop behind the repetition rule. */
export const POPOUT_MOVE_CAP = 300;
/** A position seen this many times (same side to move) draws a PopOut game. */
export const REPETITION_LIMIT = 3;

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function createBoard(cols: number, rows: number): Board {
  return Array.from({ length: cols }, () => Array<Seat | null>(rows).fill(null));
}

export function columnHeight(board: Board, column: number): number {
  const col = board[column];
  let h = 0;
  while (h < col.length && col[h] !== null) h++;
  return h;
}

export function other(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

/** Every disc in a run of four or more through `(column, row)`, of that disc's colour. */
export function linesThrough(board: Board, column: number, row: number): Cell[] {
  const who = board[column]?.[row];
  if (who === null || who === undefined) return [];
  const cells: Cell[] = [];
  for (const [dc, dr] of DIRECTIONS) {
    const run: Cell[] = [{ column, row }];
    for (const sign of [1, -1]) {
      let c = column + dc * sign;
      let r = row + dr * sign;
      while (board[c]?.[r] === who) {
        run.push({ column: c, row: r });
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (run.length >= 4) cells.push(...run);
  }
  return dedupeCells(cells);
}

function dedupeCells(cells: Cell[]): Cell[] {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = `${cell.column},${cell.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The disc moves (drops, and pops in PopOut) open to the side to move. */
export function discMoves(state: GameState): Action[] {
  const moves: Action[] = [];
  for (let c = 0; c < state.cols; c++) {
    if (columnHeight(state.board, c) < state.rows) moves.push({ type: "drop", column: c });
  }
  if (state.config.popOut) {
    for (let c = 0; c < state.cols; c++) {
      if (state.board[c][0] === state.currentPlayer) moves.push({ type: "pop", column: c });
    }
  }
  return moves;
}

export function isAi(state: GameState, seat: number): boolean {
  return state.strategies[seat] != null;
}

/**
 * What `player` may do now. The side to move has its disc moves; any person
 * may resign the game in progress (even on the other side's turn) and start
 * the next game of a series.
 */
export function getLegalActions(state: GameState, player: number): Action[] {
  if (player !== 0 && player !== 1) return [];
  if (state.phase === "between-games") return isAi(state, player) ? [] : [{ type: "continue" }];
  if (state.phase !== "playing") return [];
  const actions: Action[] = player === state.currentPlayer ? discMoves(state) : [];
  if (!isAi(state, player)) actions.push({ type: "resign" });
  return actions;
}

export function getActivePlayer(state: GameState): Seat {
  return state.currentPlayer;
}

export function positionKey(board: Board, toMove: Seat): string {
  return `${board.map((col) => col.map((v) => (v === null ? "." : v)).join("")).join("/")}:${toMove}`;
}

export function initialFirstPlayer(config: Connect4Config, seed: number): Seat {
  if (config.firstPlayer === "seat0") return 0;
  if (config.firstPlayer === "seat1") return 1;
  return createRng(seed)() < 0.5 ? 0 : 1;
}

export function createInitialState(
  strategies: (AIStrategyId | null)[],
  config: Connect4Config,
  seed: number,
): GameState {
  const { cols, rows } = boardDimensions(config.board);
  const first = initialFirstPlayer(config, seed);
  const board = createBoard(cols, rows);
  return {
    config,
    cols,
    rows,
    seed,
    strategies: [...strategies],
    phase: "playing",
    gameIndex: 0,
    board,
    currentPlayer: first,
    firstPlayer: first,
    moves: [],
    positionCounts: config.popOut ? { [positionKey(board, first)]: 1 } : {},
    winningCells: [],
    wins: [0, 0],
    games: [],
    seriesWinner: null,
  };
}

/** Apply `action` by `player` in place. Throws on anything illegal. */
export function applyAction(state: GameState, action: Action, player: number): void {
  if (!getLegalActions(state, player).some((a) => sameAction(a, action))) {
    throw new Error(`Illegal Connect 4 action ${JSON.stringify(action)} by seat ${player}`);
  }
  switch (action.type) {
    case "drop":
      drop(state, action.column);
      return;
    case "pop":
      pop(state, action.column);
      return;
    case "resign": {
      const loser = player as Seat;
      endGame(state, other(loser), "resign", [], loser);
      return;
    }
    case "continue":
      startNextGame(state);
      return;
  }
}

export function applyActionPure(state: GameState, action: Action, player: number): GameState {
  const next = structuredClone(state);
  applyAction(next, action, player);
  return next;
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if ((a.type === "drop" || a.type === "pop") && (b.type === "drop" || b.type === "pop")) {
    return a.column === b.column;
  }
  return true;
}

function drop(state: GameState, column: number): void {
  const mover = state.currentPlayer;
  const row = columnHeight(state.board, column);
  state.board[column][row] = mover;
  state.moves.push({ type: "drop", column, row, player: mover });
  const line = linesThrough(state.board, column, row);
  if (line.length > 0) {
    endGame(state, mover, "connect", line);
    return;
  }
  afterMove(state);
}

function pop(state: GameState, column: number): void {
  const mover = state.currentPlayer;
  const col = state.board[column];
  col.copyWithin(0, 1);
  col[col.length - 1] = null;
  state.moves.push({ type: "pop", column, row: 0, player: mover });
  // Only this column's discs moved, so only lines through them can be new.
  const lines: [Cell[], Cell[]] = [[], []];
  for (let r = 0; r < state.rows && col[r] !== null; r++) {
    const who = col[r] as Seat;
    lines[who].push(...linesThrough(state.board, column, r));
  }
  // Ruling: a pop that completes four for both colours wins for the popper.
  if (lines[mover].length > 0) {
    endGame(state, mover, "connect", dedupeCells(lines[mover]));
    return;
  }
  const opp = other(mover);
  if (lines[opp].length > 0) {
    endGame(state, opp, "connect", dedupeCells(lines[opp]));
    return;
  }
  afterMove(state);
}

function afterMove(state: GameState): void {
  state.currentPlayer = other(state.currentPlayer);
  if (state.config.popOut) {
    const key = positionKey(state.board, state.currentPlayer);
    const seen = (state.positionCounts[key] ?? 0) + 1;
    state.positionCounts[key] = seen;
    if (seen >= REPETITION_LIMIT) {
      endGame(state, null, "repetition", []);
      return;
    }
    if (state.moves.length >= POPOUT_MOVE_CAP) {
      endGame(state, null, "stalemate", []);
      return;
    }
  }
  if (discMoves(state).length === 0) {
    endGame(state, null, state.config.popOut ? "stalemate" : "full", []);
  }
}

function endGame(
  state: GameState,
  winner: Seat | null,
  reason: EndReason,
  winningCells: Cell[],
  resigned?: Seat,
): void {
  state.winningCells = winningCells;
  state.games.push({
    firstPlayer: state.firstPlayer,
    moves: state.moves,
    winner,
    reason,
    ...(resigned !== undefined ? { resigned } : {}),
    winningCells,
  });
  if (winner !== null) state.wins[winner]++;

  const played = state.games.length;
  const remaining = state.config.bestOf - played;
  const lead = Math.abs(state.wins[0] - state.wins[1]);
  if (remaining <= 0 || lead > remaining) {
    state.phase = "game-over";
    state.seriesWinner =
      state.wins[0] === state.wins[1] ? null : state.wins[0] > state.wins[1] ? 0 : 1;
  } else {
    state.phase = "between-games";
  }
}

function startNextGame(state: GameState): void {
  const first = other(state.firstPlayer);
  state.gameIndex++;
  state.phase = "playing";
  state.board = createBoard(state.cols, state.rows);
  state.firstPlayer = first;
  state.currentPlayer = first;
  state.moves = [];
  state.winningCells = [];
  state.positionCounts = state.config.popOut ? { [positionKey(state.board, first)]: 1 } : {};
}

/** Replay a game's disc moves on an empty board (for viewers and analysis). */
export function boardAfter(cols: number, rows: number, moves: readonly MoveRecord[]): Board {
  const board = createBoard(cols, rows);
  for (const move of moves) {
    const col = board[move.column];
    if (move.type === "drop") {
      col[columnHeight(board, move.column)] = move.player;
    } else {
      col.copyWithin(0, 1);
      col[col.length - 1] = null;
    }
  }
  return board;
}
