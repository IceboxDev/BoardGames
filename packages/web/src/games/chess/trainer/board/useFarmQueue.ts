/**
 * Where the open colour's waiting positions stand in the analysis farm's queue
 * (`POST /api/trainers/chess/evals/queue`), for the Home's "back from the
 * farm" estimate. Asked again every few minutes while the screen is open.
 */
import {
  EVAL_QUEUE_MAX,
  EvalQueueBodySchema,
  type EvalQueueResponse,
  EvalQueueResponseSchema,
} from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../../../../lib/api-fetch";
import type { FarmPosition } from "./useFolderLearning";

const REFRESH_MS = 5 * 60_000;

export function useFarmQueue(
  color: "w" | "b",
  waiting: readonly (readonly FarmPosition[])[],
): EvalQueueResponse | null {
  const items = useMemo(() => {
    const seen = new Map<string, FarmPosition>();
    for (const list of waiting) for (const p of list) seen.set(`${p.fen}|${p.kind}`, p);
    return [...seen.values()].slice(0, EVAL_QUEUE_MAX);
  }, [waiting]);
  const q = useQuery({
    queryKey: ["chess-trainer", "farm-queue", color, items.length, items[0]?.fen ?? ""],
    enabled: items.length > 0,
    queryFn: () =>
      apiFetch("/api/trainers/chess/evals/queue", {
        method: "POST",
        body: { items },
        request: EvalQueueBodySchema,
        response: EvalQueueResponseSchema,
      }),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  });
  return q.data ?? null;
}
