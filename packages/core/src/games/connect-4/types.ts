import type { Connect4Config } from "./manifest";
import type { AIStrategyId } from "./strategy-info";

export type { AIStrategyId } from "./strategy-info";
export { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "./strategy-info";

/** A seat: 0 plays Red, 1 plays Yellow, for the whole series. */
export type Seat = 0 | 1;

/** `board[column][row]`, row 0 at the bottom. */
export type Board = (Seat | null)[][];

export interface Cell {
  column: number;
  row: number;
}

export type Action =
  | { type: "drop"; column: number }
  | { type: "pop"; column: number }
  | { type: "resign" }
  | { type: "continue" };

/** A disc move as it happened: where a drop landed, or which column was popped. */
export interface MoveRecord {
  type: "drop" | "pop";
  column: number;
  /** The row a drop landed in; 0 for a pop. */
  row: number;
  player: Seat;
}

export type EndReason = "connect" | "full" | "repetition" | "resign" | "stalemate";

export interface GameRecord {
  firstPlayer: Seat;
  moves: MoveRecord[];
  winner: Seat | null;
  reason: EndReason;
  /** The resigning seat, for `reason: "resign"`. */
  resigned?: Seat;
  winningCells: Cell[];
}

export type Phase = "playing" | "between-games" | "game-over";

export interface GameState {
  config: Connect4Config;
  cols: number;
  rows: number;
  seed: number;
  /** One per seat; `null` is a person. */
  strategies: (AIStrategyId | null)[];
  phase: Phase;
  /** 0-based index of the game being played (or just finished) in the series. */
  gameIndex: number;
  board: Board;
  currentPlayer: Seat;
  firstPlayer: Seat;
  /** The current game's moves. */
  moves: MoveRecord[];
  /** PopOut only: how often each position (board + side to move) has occurred this game. */
  positionCounts: Record<string, number>;
  /** Discs of the four-in-a-row that ended the last game (empty while playing). */
  winningCells: Cell[];
  /** Games won per seat (draws count for nobody). */
  wins: [number, number];
  /** Finished games, the current one included once it ends. */
  games: GameRecord[];
  /** Set when the series ends: the winning seat, or `null` for a tied series. */
  seriesWinner: Seat | null;
}

export interface Connect4PlayerView {
  config: Connect4Config;
  cols: number;
  rows: number;
  phase: Phase;
  gameIndex: number;
  board: Board;
  currentPlayer: Seat;
  firstPlayer: Seat;
  moves: MoveRecord[];
  winningCells: Cell[];
  wins: [number, number];
  games: GameRecord[];
  seriesWinner: Seat | null;
  /** Which seats are AI, and which. */
  strategies: (AIStrategyId | null)[];
}

export interface Connect4Result {
  seriesWinner: Seat | null;
  wins: [number, number];
  gamesPlayed: number;
}

export interface AIStrategy {
  pickAction(state: GameState, legal: Action[], player: Seat): Action;
}
