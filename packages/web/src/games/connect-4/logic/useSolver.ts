import type { PositionInput } from "@boardgames/core/games/connect-4/solver/analysis";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  type ColumnsState,
  EVALUATION_OFF,
  EVALUATION_THINKING,
  type EvaluationState,
  type GameAnalysis,
  type GradedGame,
  gameKey,
  NO_ANALYSIS,
  NO_COLUMNS,
  positionKey,
  solverClient,
} from "./solver-client";

export type { ColumnsState, EvaluationState, GameAnalysis } from "./solver-client";

/** The solver's answer for `input` ("thinking" until it lands; null input: "off"). */
export function usePositionEval(input: PositionInput | null): EvaluationState {
  const key = useMemo(() => (input ? positionKey(input) : null), [input]);
  useEffect(() => {
    if (input) solverClient.requestEvaluation(input);
  }, [input]);
  const snapshot = useCallback(
    () => (key === null ? EVALUATION_OFF : (solverClient.evaluation(key) ?? EVALUATION_THINKING)),
    [key],
  );
  return useSyncExternalStore(solverClient.subscribe, snapshot);
}

/**
 * Every column's outcome for `input`'s side to move, filling in as solved
 * (null input: none). `"prefetch"` asks behind everything else — for a
 * position that helps but isn't the one on screen.
 */
export function useColumnVerdicts(
  input: PositionInput | null,
  priority: "now" | "prefetch" = "now",
): ColumnsState {
  const key = useMemo(() => (input ? positionKey(input) : null), [input]);
  useEffect(() => {
    if (!input) return;
    if (priority === "now") solverClient.requestColumns(input);
    else solverClient.prefetchColumns([input]);
  }, [input, priority]);
  const snapshot = useCallback(
    () => (key === null ? NO_COLUMNS : (solverClient.columns(key) ?? NO_COLUMNS)),
    [key],
  );
  return useSyncExternalStore(solverClient.subscribe, snapshot);
}

/** Every move of a finished drop-only game, graded as the worker gets to it (null: don't). */
export function useGameAnalysis(game: GradedGame | null): GameAnalysis {
  const key = useMemo(() => (game ? gameKey(game) : null), [game]);
  useEffect(() => {
    if (game) solverClient.requestAnalysis(game);
  }, [game]);
  const snapshot = useCallback(
    () => (key === null ? NO_ANALYSIS : (solverClient.analysis(key) ?? NO_ANALYSIS)),
    [key],
  );
  return useSyncExternalStore(solverClient.subscribe, snapshot);
}
