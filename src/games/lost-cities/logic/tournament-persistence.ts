import type { TournamentGameLog } from "./tournament-log";

const STORAGE_KEY = "lost-cities-tournament-v1";
const GAMES_KEY_PREFIX = "lost-cities-tournament-games-";

export interface TournamentResult {
  strategyA: string;
  strategyB: string;
  gamesPlayed: number;
  aWins: number;
  bWins: number;
  draws: number;
  avgScoreA: number;
  avgScoreB: number;
  timestamp: number;
}

export function saveTournamentResult(result: TournamentResult): void {
  const all = loadTournamentResults();
  const idx = all.findIndex(
    (r) => r.strategyA === result.strategyA && r.strategyB === result.strategyB,
  );
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

export function getTournamentResult(aId: string, bId: string): TournamentResult | undefined {
  return loadTournamentResults().find((r) => r.strategyA === aId && r.strategyB === bId);
}

function gamesKey(aId: string, bId: string): string {
  return `${GAMES_KEY_PREFIX}${aId}--${bId}`;
}

export function saveTournamentGames(aId: string, bId: string, games: TournamentGameLog[]): void {
  try {
    localStorage.setItem(gamesKey(aId, bId), JSON.stringify(games));
  } catch {
    // localStorage full — silently skip game log storage
  }
}

export function loadTournamentGames(aId: string, bId: string): TournamentGameLog[] {
  try {
    const raw = localStorage.getItem(gamesKey(aId, bId));
    if (!raw) return [];
    return JSON.parse(raw) as TournamentGameLog[];
  } catch {
    return [];
  }
}

export function clearTournamentResults(): void {
  localStorage.removeItem(STORAGE_KEY);

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(GAMES_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
