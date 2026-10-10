/**
 * The messages between the page and the solver worker (`solver.worker.ts`),
 * typed on both ends: the worker `satisfies` every reply, the client
 * narrows on `kind`.
 */

import type {
  MoveGrade,
  PositionEval,
  PositionInput,
  Verdict,
} from "@boardgames/core/games/connect-4/solver/analysis";
import type { MoveRecord } from "@boardgames/core/games/connect-4/types";

export type SolverRequest =
  | { id: number; kind: "evaluate"; input: PositionInput; nodeBudget: number }
  /** Every column's outcome; `nodeBudget` is per column. */
  | { id: number; kind: "columns"; input: PositionInput; nodeBudget: number }
  /** Grade moves `from` (inclusive) to `to` (exclusive): one slice of a game. */
  | {
      id: number;
      kind: "grade";
      cols: number;
      rows: number;
      moves: MoveRecord[];
      from: number;
      to: number;
      nodeBudget: number;
    };

export type SolverReply =
  /** `final: false` is a quick win/draw/loss answer; an exact one follows. */
  | { id: number; kind: "evaluation"; evaluation: PositionEval; final: boolean }
  | { id: number; kind: "column"; column: number; verdict: Verdict | null }
  | { id: number; kind: "grade"; grade: MoveGrade }
  | { id: number; kind: "done" }
  | { id: number; kind: "error"; error: string };
