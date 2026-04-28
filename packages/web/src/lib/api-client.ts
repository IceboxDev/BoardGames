import { apiUrl } from "./api-base";

const BASE_PATH = "/api";
const url = (path: string) => apiUrl(`${BASE_PATH}${path}`);
const opts: RequestInit = { credentials: "include" };

export interface TournamentSummary {
  id: string;
  game_slug: string;
  config: Record<string, unknown>;
  status: string;
  result: Record<string, unknown> | null;
  progress_completed: number;
  progress_total: number;
  created_at: string;
  completed_at: string | null;
}

export interface TournamentDetail extends TournamentSummary {}

export interface ReplaySummary {
  id: number;
  aiEngine: string | null;
  scoreP0: number | null;
  scoreP1: number | null;
  winner: string | null;
  createdAt: string;
}

export const apiClient = {
  async healthy(): Promise<boolean> {
    const res = await fetch(url("/health"), opts);
    return res.ok;
  },

  async startTournament(
    gameSlug: string,
    config: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const res = await fetch(url("/tournaments"), {
      ...opts,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug, config }),
    });
    return res.json();
  },

  async getTournament(id: string): Promise<TournamentDetail> {
    const res = await fetch(url(`/tournaments/${id}`), opts);
    return res.json();
  },

  async listTournaments(gameSlug?: string, status?: string): Promise<TournamentSummary[]> {
    const params = new URLSearchParams();
    if (gameSlug) params.set("gameSlug", gameSlug);
    if (status) params.set("status", status);
    const res = await fetch(url(`/tournaments?${params}`), opts);
    return res.json();
  },

  streamProgress(id: string): EventSource {
    return new EventSource(url(`/tournaments/${id}/stream`), { withCredentials: true });
  },

  async abortTournament(id: string): Promise<void> {
    await fetch(url(`/tournaments/${id}`), { ...opts, method: "DELETE" });
  },

  async getTournamentGames(id: string): Promise<unknown[]> {
    const res = await fetch(url(`/tournaments/${id}/games`), opts);
    return res.json();
  },

  async getTournamentGame(tournamentId: string, gameIndex: number): Promise<unknown> {
    const res = await fetch(url(`/tournaments/${tournamentId}/games/${gameIndex}`), opts);
    return res.json();
  },

  async getStrategies(gameSlug: string): Promise<{ id: string; label: string }[]> {
    const res = await fetch(url(`/tournaments/strategies/${gameSlug}`), opts);
    return res.json();
  },

  async saveGameResult(gameSlug: string, result: unknown): Promise<void> {
    await fetch(url(`/games/${gameSlug}/results`), {
      ...opts,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  },

  async getGameResults(gameSlug: string, limit?: number): Promise<unknown[]> {
    const params = limit ? `?limit=${limit}` : "";
    const res = await fetch(url(`/games/${gameSlug}/results${params}`), opts);
    return res.json();
  },

  async clearGameResults(gameSlug: string): Promise<void> {
    await fetch(url(`/games/${gameSlug}/results`), { ...opts, method: "DELETE" });
  },

  async getGameReplays(gameSlug: string): Promise<ReplaySummary[]> {
    const res = await fetch(url(`/games/${gameSlug}/replays`), opts);
    return res.json();
  },

  async getGameReplay(gameSlug: string, id: number): Promise<unknown> {
    const res = await fetch(url(`/games/${gameSlug}/replays/${id}`), opts);
    return res.json();
  },
};
