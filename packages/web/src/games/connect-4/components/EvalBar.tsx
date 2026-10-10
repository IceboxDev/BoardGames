import type { Verdict } from "@boardgames/core/games/connect-4/solver/analysis";
import type { Seat } from "@boardgames/core/games/connect-4/types";
import { MicroLabel, Spinner } from "../../../components/ui";
import { unsolvedText, verdictText } from "../logic/text";
import type { EvaluationState } from "../logic/useSolver";
import { DISC_COLORS } from "./board/palette";

interface Props {
  state: EvaluationState;
  toMove: Seat;
  names: readonly string[];
  board: { cols: number; rows: number };
  /** The disc count from which this board is solved exactly. */
  reach: number;
}

/**
 * Red's share of the bar: 1 = Red wins, 0 = Yellow wins, ½ = a draw or
 * unknown; a win that comes sooner sits further out.
 */
function redShare(verdict: Verdict, toMove: Seat): number {
  if (verdict.kind !== "win" && verdict.kind !== "loss") return 0.5;
  const winner: Seat = verdict.kind === "win" ? toMove : toMove === 0 ? 1 : 0;
  const strength = verdict.discs === 0 ? 0.8 : 0.7 + 0.3 / Math.max(1, verdict.discs);
  return winner === 0 ? 0.5 + strength / 2 : 0.5 - strength / 2;
}

/** The solver's verdict on the position: a Red/Yellow bar and one line of words. */
export function EvalBar({ state, toMove, names, board, reach }: Props) {
  const evaluation = state.status === "ready" ? state.evaluation : null;
  const share = evaluation?.solved ? redShare(evaluation.verdict, toMove) : 0.5;
  const counting = state.status === "ready" && !state.final;

  let words = "";
  if (state.status === "thinking") words = "Solving…";
  else if (state.status === "error") words = "The solver is unavailable";
  else if (evaluation?.solved) words = verdictText(evaluation.verdict, toMove, names);
  else if (evaluation) words = unsolvedText(evaluation.reason, board, reach);

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <MicroLabel>Evaluation</MicroLabel>
      <div className="relative h-3 overflow-hidden rounded-full bg-fill">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-500"
          style={{ width: `${share * 100}%`, background: DISC_COLORS[0].fill }}
        />
        <div
          className="absolute inset-y-0 right-0 transition-[width] duration-500"
          style={{ width: `${(1 - share) * 100}%`, background: DISC_COLORS[1].fill }}
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-fg-secondary">
        {(state.status === "thinking" || counting) && <Spinner size="sm" />}
        {words}
      </p>
    </div>
  );
}
