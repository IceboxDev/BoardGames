/**
 * One colour's drill schedule: the server's rows (`GET …/drill/:color/overview`)
 * as a map by card id, and `grade`, which queues the review in the durable
 * outbox and applies it to the cached rows at once (the same `applyReview`
 * the server runs), so the map and the folders update before the network.
 */
import type { ChessDrillOverview } from "@boardgames/core/protocol";
import {
  applyReview,
  isLeech,
  newState,
  type SrsGrade,
  type SrsState,
} from "@boardgames/core/trainers/srs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { drillKeys, drillOverviewQuery, todayKey } from "./api";
import { useDrillOutbox } from "./outbox";

export interface DrillOutcome {
  readonly played: string | null;
  readonly expected: string;
  readonly hinted: boolean;
}

export interface DrillSchedule {
  readonly today: string;
  /** Null until the first answer arrives. */
  readonly states: ReadonlyMap<string, SrsState> | null;
  readonly overview: ChessDrillOverview | null;
  readonly error: boolean;
  readonly pending: number;
  /** `source: "drill"`: free practice, which only reschedules a card that was due anyway. */
  readonly grade: (
    cardId: string,
    grade: SrsGrade,
    outcome: DrillOutcome,
    durationMs: number,
    source?: "trainer" | "drill",
  ) => void;
}

const stripLeech = ({ leech: _leech, ...s }: ChessDrillOverview["states"][number]): SrsState => s;

export function useDrill(color: "w" | "b"): DrillSchedule {
  const today = todayKey();
  const key = drillKeys.overview(color, today);
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: key,
    queryFn: drillOverviewQuery(color, today),
    staleTime: 60_000,
  });
  const outbox = useDrillOutbox();

  const states = useMemo(
    () => (q.data ? new Map(q.data.states.map((s) => [s.questionId, stripLeech(s)])) : null),
    [q.data],
  );

  const { enqueue } = outbox;
  const grade = useCallback(
    (
      cardId: string,
      g: SrsGrade,
      outcome: DrillOutcome,
      durationMs: number,
      source: "trainer" | "drill" = "trainer",
    ) => {
      const now = new Date().toISOString();
      void enqueue({
        clientId: crypto.randomUUID(),
        color,
        cardId,
        grade: g,
        localDate: today,
        durationMs: Math.min(600_000, Math.round(durationMs)),
        reviewedAt: now,
        source,
        outcome: { played: outcome.played, expected: outcome.expected, hinted: outcome.hinted },
      });
      queryClient.setQueryData<ChessDrillOverview>(drillKeys.overview(color, today), (old) => {
        if (!old) return old;
        const prev = old.states.find((s) => s.questionId === cardId);
        // Practice moves only a card that was due (the server's rule).
        if (source === "drill" && !(prev && prev.dueDate <= today)) return old;
        const next = applyReview(prev ? stripLeech(prev) : newState(cardId, today), g, {
          localDate: today,
          now,
        });
        return {
          ...old,
          states: [
            ...old.states.filter((s) => s.questionId !== cardId),
            { ...next, leech: isLeech(next) },
          ],
          today: {
            reviews: old.today.reviews + 1,
            correct: old.today.correct + (g === "again" ? 0 : 1),
          },
          introducedToday: old.introducedToday + (prev ? 0 : 1),
        };
      });
    },
    [color, today, enqueue, queryClient],
  );

  return {
    today,
    states,
    overview: q.data ?? null,
    error: q.isError,
    pending: outbox.pendingCount,
    grade,
  };
}
