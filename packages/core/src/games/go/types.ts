/**
 * Go — shared types. A point is an index `y * size + x` with `y = 0` the TOP
 * row (GTP row `size`), `x = 0` the left column (GTP column "A").
 */

/** 0 = Black, 1 = White. */
export type Color = 0 | 1;
export const BLACK: Color = 0;
export const WHITE: Color = 1;

/** Board cell values: a stone of colour `c` is stored as `c + 1`. */
export const EMPTY = 0;
export type Cell = 0 | 1 | 2;

export function stoneOf(color: Color): Cell {
  return color === BLACK ? 1 : 2;
}

export function other(color: Color): Color {
  return color === BLACK ? WHITE : BLACK;
}

/** Sizes the play surfaces offer; the engine itself handles 5–19 (SGF review). */
export const PLAY_SIZES = [9, 13, 19] as const;
export type PlaySize = (typeof PLAY_SIZES)[number];
export const MIN_SIZE = 5;
export const MAX_SIZE = 19;

export type IllegalReason = "occupied" | "suicide" | "superko" | "off-board";

export class IllegalMove extends Error {
  readonly reason: IllegalReason;
  constructor(reason: IllegalReason, point: number) {
    super(`Illegal move at ${point}: ${reason}`);
    this.name = "IllegalMove";
    this.reason = reason;
  }
}

/** One move as played: a stone (`point`) or a pass (`null`), and what it captured. */
export interface PlayedMove {
  readonly color: Color;
  readonly point: number | null;
  readonly captured: readonly number[];
}

/** The fixed parameters of one game. */
export interface GoRules {
  readonly size: number;
  readonly komi: number;
  /** Fixed handicap stones for Black (0 or 2–9). White moves first when > 0. */
  readonly handicap: number;
}

/**
 * A game position plus everything positional superko and undo need. JSON-safe
 * (it lives in an XState context and crosses the wire as part of views).
 */
export interface GoGame extends GoRules {
  readonly handicapStones: readonly number[];
  readonly board: readonly Cell[];
  readonly toMove: Color;
  /** Stones captured BY each colour (prisoners), indexed by `Color`. */
  readonly captures: readonly [number, number];
  readonly consecutivePasses: number;
  /** Zobrist keys of every whole-board position so far, the start included. */
  readonly history: readonly string[];
  readonly moves: readonly PlayedMove[];
}
