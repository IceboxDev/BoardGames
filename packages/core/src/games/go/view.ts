/**
 * What crosses the wire for Go: the actions a seat can send and the view each
 * seat receives. Browser-safe — no engine or AI imports beyond types.
 */

import type { SeatClock, TimeControl } from "../../machines/clock";
import type { GoStrategy } from "./manifest";
import type { ScoreBreakdown } from "./scoring";
import type { Cell, Color } from "./types";

export type GoAction =
  | { readonly type: "play"; readonly point: number }
  | { readonly type: "pass" }
  | { readonly type: "resign" }
  /** Against the AI: take back to your previous move. In PvP: ask the opponent. */
  | { readonly type: "undo" }
  | { readonly type: "undo-accept" }
  | { readonly type: "undo-decline" }
  | { readonly type: "toggle-dead"; readonly point: number }
  /** `key` names the proposal being accepted, so a stale accept can't land on a changed one. */
  | { readonly type: "accept-score"; readonly key: string }
  | { readonly type: "resume" };

export type GoEndReason = "score" | "resign" | "timeout";

export interface GoResult {
  readonly reason: GoEndReason;
  /** `null`: jigo. */
  readonly winner: Color | null;
  /** "B+3.5", "W+R", "B+T", "0". */
  readonly result: string;
  readonly breakdown: ScoreBreakdown | null;
  readonly dead: readonly number[];
}

export interface GoMoveView {
  readonly color: Color;
  readonly point: number | null;
  readonly captured: number;
}

export interface GoClockView {
  readonly timeControl: TimeControl;
  /** Indexed by colour, as of the start of the running turn. */
  readonly clocks: readonly [SeatClock, SeatClock];
  /** Whose clock is running, or `null` (scoring, game over). */
  readonly running: Color | null;
  /** How far into the running turn the server was when it built this view. */
  readonly elapsedMs: number;
}

export interface GoScoringView {
  readonly dead: readonly number[];
  readonly accepted: readonly [boolean, boolean];
  readonly key: string;
  /** Still waiting for the dead-stone proposal. */
  readonly proposing: boolean;
  /** After repeated disputes every stone counts as alive — settle it by playing. */
  readonly locked: boolean;
  readonly breakdown: ScoreBreakdown;
}

export interface GoPlayerView {
  readonly size: number;
  readonly komi: number;
  readonly handicap: number;
  readonly handicapStones: readonly number[];
  readonly board: readonly Cell[];
  readonly toMove: Color;
  readonly captures: readonly [number, number];
  readonly moves: readonly GoMoveView[];
  readonly koPoint: number | null;
  /** This seat's colour (the seat index); `null` for an observer. */
  readonly you: Color | null;
  /** Strategy per colour; `null` for a person. */
  readonly players: readonly [GoStrategy | null, GoStrategy | null];
  readonly clock: GoClockView | null;
  /** A pending take-back request (PvP). */
  readonly undoRequest: { readonly by: Color } | null;
  readonly scoring: GoScoringView | null;
  readonly resumes: number;
  readonly result: GoResult | null;
  /** An AI move came from a fallback bot (the engine was unavailable). */
  readonly aiDegraded: boolean;
}
