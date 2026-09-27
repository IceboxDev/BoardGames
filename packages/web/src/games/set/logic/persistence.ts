import { type GameRecord, GameRecordSchema } from "@boardgames/core/games/set/types";
import { MAX_BULK_RESULT_RECORDS } from "@boardgames/core/protocol";
import { apiClient } from "../../../lib/api-client";

const STORAGE_KEY = "set-game-history-v3";
const SLUG = "set";

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

/** The browser's copy of the history; a record that no longer parses is dropped. */
export function loadGameHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored: unknown = JSON.parse(raw);
    return Array.isArray(stored) ? keepRecords(stored) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** The values that parse as trainer records. */
function keepRecords(values: readonly unknown[]): GameRecord[] {
  return values.flatMap((value) => {
    const parsed = GameRecordSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

// ---------------------------------------------------------------------------
// Server API — the shared game-results endpoints, through `apiClient`.
// ---------------------------------------------------------------------------

export async function postGameRecordToServer(record: GameRecord): Promise<boolean> {
  try {
    await apiClient.saveGameResult(SLUG, record);
    return true;
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
  const total = { inserted: 0, skipped: 0 };
  for (let i = 0; i < records.length; i += MAX_BULK_RESULT_RECORDS) {
    try {
      const page = await apiClient.saveGameResultsBulk(
        SLUG,
        records.slice(i, i + MAX_BULK_RESULT_RECORDS),
      );
      total.inserted += page.inserted;
      total.skipped += page.skipped;
    } catch {
      return null;
    }
  }
  return total;
}

/** The server's copy; rows that don't parse as trainer records are skipped. */
export async function fetchServerHistory(): Promise<GameRecord[]> {
  try {
    return keepRecords(await apiClient.getGameResults(SLUG, 10_000));
  } catch {
    return [];
  }
}

export async function clearServerHistory(): Promise<boolean> {
  try {
    await apiClient.clearGameResults(SLUG);
    return true;
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
