import type { AIEngine, GameResult } from "./types";

const STORAGE_KEY = "lost-cities-history-v1";

export function saveGameResult(result: GameResult): void {
  const history = loadGameHistory();
  history.push(result);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function loadGameHistory(): GameResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const results = JSON.parse(raw) as GameResult[];
    for (const r of results) {
      if ((r.aiEngine as string) === "ismcts") {
        r.aiEngine = "ismcts-v2";
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function getStats(engine?: AIEngine): {
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  bestMargin: number;
  avgScore: number;
} {
  const all = loadGameHistory();
  const history = engine ? all.filter((r) => r.aiEngine === engine) : all;

  let wins = 0;
  let losses = 0;
  let ties = 0;
  let bestMargin = 0;
  let totalScore = 0;

  for (const r of history) {
    if (r.won) wins++;
    else if (r.margin === 0) ties++;
    else losses++;

    if (r.margin > bestMargin) bestMargin = r.margin;
    totalScore += r.playerScore.total;
  }

  return {
    gamesPlayed: history.length,
    wins,
    losses,
    ties,
    bestMargin,
    avgScore: history.length > 0 ? Math.round(totalScore / history.length) : 0,
  };
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
