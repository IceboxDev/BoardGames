import type { AIStrategyId, GameResult } from "./types";

const STORAGE_KEY = "exploding-kittens-history-v1";

export function saveGameResult(result: GameResult): void {
  const history = loadGameHistory();
  history.push(result);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function loadGameHistory(): GameResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GameResult[];
  } catch {
    return [];
  }
}

export interface GameStats {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  avgTurnCount: number;
}

export function getStats(strategyFilter?: AIStrategyId): GameStats {
  let history = loadGameHistory();

  if (strategyFilter) {
    history = history.filter((r) => r.aiStrategies.includes(strategyFilter));
  }

  const totalGames = history.length;
  const wins = history.filter((r) => r.winnerIsHuman).length;
  const losses = totalGames - wins;
  const avgTurnCount =
    totalGames > 0 ? history.reduce((sum, r) => sum + r.turnCount, 0) / totalGames : 0;

  return {
    totalGames,
    wins,
    losses,
    winRate: totalGames > 0 ? wins / totalGames : 0,
    avgTurnCount,
  };
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
