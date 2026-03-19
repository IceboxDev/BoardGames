const BASE_URL = "/api";

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
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  },

  async startTournament(
    gameSlug: string,
    config: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const res = await fetch(`${BASE_URL}/tournaments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug, config }),
    });
    return res.json();
  },

  async getTournament(id: string): Promise<TournamentDetail> {
    const res = await fetch(`${BASE_URL}/tournaments/${id}`);
    return res.json();
  },

  async listTournaments(gameSlug?: string, status?: string): Promise<TournamentSummary[]> {
    const params = new URLSearchParams();
    if (gameSlug) params.set("gameSlug", gameSlug);
    if (status) params.set("status", status);
    const res = await fetch(`${BASE_URL}/tournaments?${params}`);
    return res.json();
  },

  streamProgress(id: string): EventSource {
    return new EventSource(`${BASE_URL}/tournaments/${id}/stream`);
  },

  async abortTournament(id: string): Promise<void> {
    await fetch(`${BASE_URL}/tournaments/${id}`, { method: "DELETE" });
  },

  async getTournamentGames(id: string): Promise<unknown[]> {
    const res = await fetch(`${BASE_URL}/tournaments/${id}/games`);
    return res.json();
  },

  async getTournamentGame(tournamentId: string, gameIndex: number): Promise<unknown> {
    const res = await fetch(`${BASE_URL}/tournaments/${tournamentId}/games/${gameIndex}`);
    return res.json();
  },

  async getStrategies(gameSlug: string): Promise<{ id: string; label: string }[]> {
    const res = await fetch(`${BASE_URL}/tournaments/strategies/${gameSlug}`);
    return res.json();
  },

  async saveGameResult(gameSlug: string, result: unknown): Promise<void> {
    await fetch(`${BASE_URL}/games/${gameSlug}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  },

  async getGameResults(gameSlug: string, limit?: number): Promise<unknown[]> {
    const params = limit ? `?limit=${limit}` : "";
    const res = await fetch(`${BASE_URL}/games/${gameSlug}/results${params}`);
    return res.json();
  },

  async clearGameResults(gameSlug: string): Promise<void> {
    await fetch(`${BASE_URL}/games/${gameSlug}/results`, { method: "DELETE" });
  },

  async getGameReplays(gameSlug: string): Promise<ReplaySummary[]> {
    const res = await fetch(`${BASE_URL}/games/${gameSlug}/replays`);
    return res.json();
  },

  async getGameReplay(gameSlug: string, id: number): Promise<unknown> {
    const res = await fetch(`${BASE_URL}/games/${gameSlug}/replays/${id}`);
    return res.json();
  },
};
