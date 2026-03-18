const STORAGE_KEY = "exploding-kittens-tournament-v1";

export interface TournamentResult {
  strategies: string[];
  gamesPlayed: number;
  wins: Record<string, number>;
  avgSurvivalRank: Record<string, number>;
  timestamp: number;
}

export function saveTournamentResult(result: TournamentResult): void {
  const all = loadTournamentResults();
  const key = result.strategies.sort().join(",");
  const idx = all.findIndex((r) => r.strategies.sort().join(",") === key);
  if (idx >= 0) {
    all[idx] = result;
  } else {
    all.push(result);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function loadTournamentResults(): TournamentResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TournamentResult[];
  } catch {
    return [];
  }
}

export function clearTournamentResults(): void {
  localStorage.removeItem(STORAGE_KEY);
}
