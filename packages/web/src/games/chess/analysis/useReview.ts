/**
 * The review board's state: which position is on screen, a what-if line
 * played from it, and "learn from your mistakes" — the board dealing each of
 * your mistakes again to find a better move. A reducer, so every rule is
 * unit-tested (`useReview.test.ts`); the engine's verdicts come in as actions.
 *
 * `ply` is the game position on screen (0 = the start, `total` = the end).
 */

import { useCallback, useReducer } from "react";
import type { Verdict } from "./review-model";

/** Misses before practice shows the move. */
export const MISSES_BEFORE_REVEAL = 2;

/** A what-if line: moves played from game position `from`. */
export interface SideLine {
  readonly from: number;
  readonly moves: readonly string[];
}

export interface Practice {
  /** Move indices to practise; the position shown is the one before each. */
  readonly queue: readonly number[];
  readonly at: number;
  /** The move being judged (shown on the board meanwhile), or `null`. */
  readonly tried: string | null;
  readonly misses: number;
  readonly revealed: boolean;
  /** This position's answer: found (`best` / `keeps`), or not yet. */
  readonly solved: Exclude<Verdict, "miss"> | null;
  /** Per queue entry: found without the move being shown. */
  readonly found: readonly boolean[];
  /** Past the last one: the summary shows until practice is left. */
  readonly done: boolean;
  /** Where the board goes back to afterwards. */
  readonly returnTo: number;
}

export interface ReviewState {
  readonly ply: number;
  readonly line: SideLine | null;
  readonly practice: Practice | null;
}

export type ReviewAction =
  | { type: "go"; ply: number }
  | { type: "step"; by: 1 | -1 }
  | { type: "play"; uci: string }
  | { type: "undo" }
  | { type: "leave-line" }
  | { type: "practice"; queue: readonly number[] }
  | { type: "try"; uci: string }
  | { type: "answer"; verdict: Verdict }
  | { type: "retry" }
  | { type: "next" }
  | { type: "stop-practice" };

const clamp = (n: number, total: number) => Math.max(0, Math.min(total, n));

export function reviewReducer(
  state: ReviewState,
  action: ReviewAction,
  total: number,
): ReviewState {
  const p = state.practice;
  if (p) {
    switch (action.type) {
      case "try":
        if (p.solved || p.done || p.tried) return state;
        return { ...state, practice: { ...p, tried: action.uci } };
      case "answer": {
        if (!p.tried || p.solved) return state;
        if (action.verdict === "miss") {
          const misses = p.misses + 1;
          // The tried move stays on the board until `retry` takes it back.
          return {
            ...state,
            practice: { ...p, misses, revealed: p.revealed || misses >= MISSES_BEFORE_REVEAL },
          };
        }
        const found = p.found.map((f, i) => (i === p.at ? !p.revealed : f));
        return { ...state, practice: { ...p, solved: action.verdict, found } };
      }
      case "retry":
        return p.solved ? state : { ...state, practice: { ...p, tried: null } };
      case "next": {
        if (p.done) return state;
        const at = p.at + 1;
        if (at >= p.queue.length) return { ...state, practice: { ...p, done: true, tried: null } };
        return {
          ...state,
          ply: p.queue[at] ?? state.ply,
          practice: { ...p, at, tried: null, misses: 0, revealed: false, solved: null },
        };
      }
      case "stop-practice":
        return { ply: p.returnTo, line: null, practice: null };
      default:
        // The board is the practice's while it runs.
        return state;
    }
  }

  switch (action.type) {
    case "go":
      return { ...state, ply: clamp(action.ply, total), line: null };
    case "step":
      if (state.line) {
        // ← inside a what-if line takes its last move back; → does nothing.
        return action.by === -1 ? reviewReducer(state, { type: "undo" }, total) : state;
      }
      return { ...state, ply: clamp(state.ply + action.by, total) };
    case "play": {
      const line = state.line ?? { from: state.ply, moves: [] };
      return { ...state, line: { ...line, moves: [...line.moves, action.uci] } };
    }
    case "undo": {
      if (!state.line) return state;
      const moves = state.line.moves.slice(0, -1);
      return { ...state, line: moves.length > 0 ? { ...state.line, moves } : null };
    }
    case "leave-line":
      return { ...state, line: null };
    case "practice": {
      const first = action.queue[0];
      if (first === undefined) return state;
      return {
        ply: first,
        line: null,
        practice: {
          queue: action.queue,
          at: 0,
          tried: null,
          misses: 0,
          revealed: false,
          solved: null,
          found: action.queue.map(() => false),
          done: false,
          returnTo: state.ply,
        },
      };
    }
    default:
      return state;
  }
}

/** The reducer bound to a game of `total` moves, opening on its final position. */
export function useReview(total: number) {
  const reducer = useCallback(
    (s: ReviewState, a: ReviewAction) => reviewReducer(s, a, total),
    [total],
  );
  return useReducer(reducer, { ply: total, line: null, practice: null });
}
