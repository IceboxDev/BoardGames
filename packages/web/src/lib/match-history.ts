import {
  DeleteMatchResponseSchema,
  type HistoryListResponse,
  HistoryListResponseSchema,
  type MatchCreateInput,
  MatchCreateInputSchema,
  type MatchRecord,
  MatchRecordSchema,
  MatchReorderInputSchema,
  MatchReorderResponseSchema,
  type MatchUpdateInput,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch";

export async function fetchHistory(
  opts: { limit?: number; before?: string | null; signal?: AbortSignal } = {},
): Promise<HistoryListResponse> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.before) params.set("before", opts.before);
  const qs = params.toString();
  return apiFetch(`/api/history${qs ? `?${qs}` : ""}`, {
    response: HistoryListResponseSchema,
    signal: opts.signal,
  });
}

export async function recordMatch(input: MatchCreateInput): Promise<MatchRecord> {
  return apiFetch("/api/admin/history", {
    method: "POST",
    body: input,
    request: MatchCreateInputSchema,
    response: MatchRecordSchema,
  });
}

export async function updateMatch(id: number, input: MatchUpdateInput): Promise<MatchRecord> {
  return apiFetch(`/api/admin/history/${id}`, {
    method: "PATCH",
    body: input,
    request: MatchCreateInputSchema,
    response: MatchRecordSchema,
  });
}

export async function deleteMatch(id: number): Promise<void> {
  await apiFetch(`/api/admin/history/${id}`, {
    method: "DELETE",
    response: DeleteMatchResponseSchema,
  });
}

/**
 * Re-sort the matches inside one board game night. `orderedIds` must be the
 * full, top-to-bottom list of that night's match ids.
 */
export async function reorderMatchesInNight(dateKey: string, orderedIds: number[]): Promise<void> {
  await apiFetch("/api/admin/history/reorder", {
    method: "POST",
    body: { dateKey, orderedIds },
    request: MatchReorderInputSchema,
    response: MatchReorderResponseSchema,
  });
}
