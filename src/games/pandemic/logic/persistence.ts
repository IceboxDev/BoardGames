import type { GameResult } from "./types";

const STORAGE_KEY = "pandemic-history-v1";

export interface PandemicGameRecord {
  date: string;
  result: GameResult;
  turns: number;
  outbreaks: number;
  difficulty: 4 | 5 | 6;
  numPlayers: number;
}

export function saveGameResult(record: PandemicGameRecord): void {
  const history = loadHistory();
  history.push(record);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage may be full or unavailable
  }
}

export function loadHistory(): PandemicGameRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PandemicGameRecord[];
  } catch {
    return [];
  }
}

export function getStats() {
  const history = loadHistory();
  const gamesPlayed = history.length;
  const wins = history.filter((g) => g.result === "win").length;
  const losses = gamesPlayed - wins;
  const avgOutbreaks =
    gamesPlayed > 0 ? history.reduce((s, g) => s + g.outbreaks, 0) / gamesPlayed : 0;

  return { gamesPlayed, wins, losses, avgOutbreaks };
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
