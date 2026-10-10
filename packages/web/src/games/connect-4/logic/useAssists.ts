import {
  type PositionInput,
  type SolverMove,
  searchReach,
} from "@boardgames/core/games/connect-4/solver/analysis";
import type { Connect4PlayerView } from "@boardgames/core/games/connect-4/types";
import { useCallback, useMemo, useState } from "react";
import { type EvaluationState, usePositionEval } from "./useSolver";

export interface Assists {
  /** Hints and the evaluation bar are offered (the table allows them, a game is on). */
  available: boolean;
  /** The evaluation bar can say something here (not PopOut, whose positions can't be solved). */
  evalAvailable: boolean;
  evalOn: boolean;
  toggleEval: () => void;
  /** The solver's answer for the position on the board ("off" when nobody asked). */
  evaluation: EvaluationState;
  /** Ask for a hint at this position (null when it isn't the viewer's move). */
  requestHint: (() => void) | null;
  /** The hint asked for at this position: its moves, once the solver has them. */
  hint: readonly SolverMove[];
  hintBusy: boolean;
  /** The disc count from which this board is solved exactly (8×7's opening isn't). */
  reach: number;
}

/**
 * The table's assists for one board: the evaluation bar (on / off, kept
 * across moves) and hints (asked per position — a hint for move 6 of one
 * game never lights up at move 6 of the next). The solver runs only while
 * the bar is on or a hint is wanted.
 */
export function useAssists(view: Connect4PlayerView, myTurn: boolean): Assists {
  const available = view.config.assists && view.phase === "playing";
  // Only PopOut rules the bar out up front; how far the solver reaches is the
  // worker's call (it holds the opening books), and it says so in its answer.
  const evalAvailable = available && !view.config.popOut;
  const here = `${view.gameIndex}:${view.moves.length}`;

  const [evalOn, setEvalOn] = useState(false);
  const [hintAt, setHintAt] = useState<string | null>(null);
  const hintWanted = available && myTurn && hintAt === here;
  const wantSolver = hintWanted || (evalAvailable && evalOn);

  const input = useMemo<PositionInput | null>(
    () =>
      wantSolver
        ? {
            cols: view.cols,
            rows: view.rows,
            popOut: view.config.popOut,
            board: view.board,
            toMove: view.currentPlayer,
          }
        : null,
    [wantSolver, view.cols, view.rows, view.config.popOut, view.board, view.currentPlayer],
  );
  const evaluation = usePositionEval(input);
  const settled = evaluation.status === "ready" && evaluation.final;

  return {
    available,
    evalAvailable,
    evalOn: evalAvailable && evalOn,
    toggleEval: useCallback(() => setEvalOn((on) => !on), []),
    evaluation,
    requestHint: useMemo(
      () => (available && myTurn ? () => setHintAt(here) : null),
      [available, myTurn, here],
    ),
    hint: hintWanted && settled ? evaluation.evaluation.best : [],
    hintBusy: hintWanted && !settled,
    reach: searchReach(view.cols, view.rows),
  };
}
