import type { GameRecord } from "@boardgames/core/games/set/types";

const STORAGE_KEY = "set-game-history-v3";
const API_BASE = "/api/games/set";

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
    const res = await fetch(`${API_BASE}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postBulkRecordsToServer(
  records: GameRecord[],
): Promise<{ inserted: number; skipped: number } | null> {
  if (records.length === 0) return { inserted: 0, skipped: 0 };
  try {
    const res = await fetch(`${API_BASE}/results/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { inserted: number; skipped: number };
  } catch {
    return null;
  }
}

export async function fetchServerHistory(): Promise<GameRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/results?limit=10000`);
    if (!res.ok) return [];
    return (await res.json()) as GameRecord[];
  } catch {
    return [];
  }
}

export async function clearServerHistory(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/results`, { method: "DELETE" });
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
