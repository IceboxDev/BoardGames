import type {
  HistoryListResponse,
  MatchCreateInput,
  MatchRecord,
  MatchUpdateInput,
} from "@boardgames/core/history/types";
import { apiUrl } from "./api-base";

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Request failed (${res.status})`;
}

export async function fetchHistory(
  opts: { limit?: number; before?: string | null; signal?: AbortSignal } = {},
): Promise<HistoryListResponse> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.before) params.set("before", opts.before);
  const qs = params.toString();
  const res = await fetch(apiUrl(`/api/history${qs ? `?${qs}` : ""}`), {
    credentials: "include",
    signal: opts.signal,
  });
  if (res.status === 401) return { matches: [], nextBefore: null };
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as HistoryListResponse;
}

export async function fetchMatchesForNight(
  dateKey: string,
  signal?: AbortSignal,
): Promise<MatchRecord[]> {
  const res = await fetch(apiUrl(`/api/history/by-night/${dateKey}`), {
    credentials: "include",
    signal,
  });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { matches: MatchRecord[] };
  return data.matches;
}

export async function recordMatch(input: MatchCreateInput): Promise<MatchRecord> {
  const res = await fetch(apiUrl("/api/admin/history"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as MatchRecord;
}

export async function updateMatch(id: number, input: MatchUpdateInput): Promise<MatchRecord> {
  const res = await fetch(apiUrl(`/api/admin/history/${id}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as MatchRecord;
}

export async function deleteMatch(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/history/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
}
