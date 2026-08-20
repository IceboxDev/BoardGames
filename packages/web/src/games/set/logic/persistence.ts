import type { GameRecord } from "@boardgames/core/games/set/types";
import { MAX_BULK_RESULT_RECORDS } from "@boardgames/core/protocol";
import { apiUrl } from "../../../lib/api-base";

const STORAGE_KEY = "set-game-history-v3";
const API_PATH = "/api/games/set";
const url = (suffix: string) => apiUrl(`${API_PATH}${suffix}`);
const credOpts: RequestInit = { credentials: "include" };

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

export function saveGameRecord(record: GameRecord): void {
  const history = loadGameHistory();
  history.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function saveFullHistory(history: GameRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function loadGameHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GameRecord[];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Server API
// ---------------------------------------------------------------------------

export async function postGameRecordToServer(record: GameRecord): Promise<boolean> {
  try {
    const res = await fetch(url("/results"), {
      ...credOpts,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Upload unsynced records, chunked to the server's per-request cap.
 *
 * The endpoint turns every record into one statement in a single
 * `db.batch(..., "write")`, so the wire schema caps a request at
 * `MAX_BULK_RESULT_RECORDS`. A long-running trainer accumulates more than that
 * in localStorage, so chunk here rather than let a big backlog 400. Each chunk
 * is independently idempotent (records carry a client `id`), so a mid-way
 * failure just leaves the rest unsynced for the next attempt.
 */
export async function postBulkRecordsToServer(
  records: GameRecord[],
): Promise<{ inserted: number; skipped: number } | null> {
  if (records.length === 0) return { inserted: 0, skipped: 0 };
  const total = { inserted: 0, skipped: 0 };
  for (let i = 0; i < records.length; i += MAX_BULK_RESULT_RECORDS) {
    const chunk = records.slice(i, i + MAX_BULK_RESULT_RECORDS);
    try {
      const res = await fetch(url("/results/bulk"), {
        ...credOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: chunk }),
      });
      if (!res.ok) return null;
      const page = (await res.json()) as { inserted: number; skipped: number };
      total.inserted += page.inserted;
      total.skipped += page.skipped;
    } catch {
      return null;
    }
  }
  return total;
}

export async function fetchServerHistory(): Promise<GameRecord[]> {
  try {
    const res = await fetch(url("/results?limit=10000"), credOpts);
    if (!res.ok) return [];
    return (await res.json()) as GameRecord[];
  } catch {
    return [];
  }
}

export async function clearServerHistory(): Promise<boolean> {
  try {
    const res = await fetch(url("/results"), { ...credOpts, method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Merge / dedup helpers (pure functions)
// ---------------------------------------------------------------------------

export function mergeHistories(local: GameRecord[], remote: GameRecord[]): GameRecord[] {
  const seen = new Map<string, GameRecord>();
  for (const r of local) seen.set(r.id, r);
  for (const r of remote) {
    if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return [...seen.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function findUnsyncedRecords(local: GameRecord[], remote: GameRecord[]): GameRecord[] {
  const remoteIds = new Set(remote.map((r) => r.id));
  return local.filter((r) => !remoteIds.has(r.id));
}

// ---------------------------------------------------------------------------
// Derived computations (pure)
// ---------------------------------------------------------------------------

export function computePersonalBests(history: GameRecord[]): Record<string, number> {
  if (history.length === 0) return {};

  return {
    bestRating: Math.max(...history.map((h) => h.rating)),
    bestNetScore: Math.max(...history.map((h) => h.netScore)),
    fastestAvgFindTime: Math.min(
      ...history.filter((h) => h.avgFindTimeMs > 0).map((h) => h.avgFindTimeMs),
    ),
    fastestSingleSet: Math.min(
      ...history.filter((h) => h.fastestSetMs > 0).map((h) => h.fastestSetMs),
    ),
    bestAccuracy: Math.max(...history.map((h) => h.accuracy)),
    bestThroughput: Math.max(...history.map((h) => h.throughput)),
    longestStreak: Math.max(...history.map((h) => h.longestStreak)),
    shortestGame: Math.min(...history.filter((h) => h.durationMs > 0).map((h) => h.durationMs)),
  };
}
