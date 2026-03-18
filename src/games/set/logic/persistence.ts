import type { GameRecord } from "./types";

const STORAGE_KEY = "set-game-history-v3";

export function saveGameRecord(record: GameRecord): void {
  const history = loadGameHistory();
  history.push(record);
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

export function getHighScores(sortBy: keyof GameRecord = "rating", limit = 20): GameRecord[] {
  const history = loadGameHistory();
  return history
    .sort((a, b) => {
      const va = a[sortBy];
      const vb = b[sortBy];
      if (typeof va === "number" && typeof vb === "number") return vb - va;
      return 0;
    })
    .slice(0, limit);
}

export function getPersonalBests(): Record<string, number> {
  const history = loadGameHistory();
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

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
