// Tournament + game-result endpoints. All `Record<string, unknown>` returns
// from the legacy version of this file have been replaced by typed schemas
// from `@boardgames/core/protocol`.

import {
  BulkSaveResultsBodySchema,
  BulkSaveResultsResponseSchema,
  GameResultListSchema,
  OkResponseSchema,
  ReplayLogSchema,
  ReplaySummaryListSchema,
  SaveResultResponseSchema,
  StartTournamentBodySchema,
  StartTournamentResponseSchema,
  StrategyListSchema,
  TournamentDetailSchema,
  TournamentGameLogListSchema,
  TournamentGameSingleSchema,
  TournamentSummaryListSchema,
} from "@boardgames/core/protocol";
import { apiUrl } from "./api-base.ts";
import { apiFetch } from "./api-fetch.ts";

export type {
  BulkSaveResultsResponse,
  GameResult,
  ReplaySummary,
  StrategyInfo,
  TournamentDetail,
  TournamentGameLog,
  TournamentSummary,
} from "@boardgames/core/protocol";

const BASE = "/api";

export const apiClient = {
  async healthy(): Promise<boolean> {
    const res = await fetch(apiUrl(`${BASE}/health`), { credentials: "include" });
    return res.ok;
  },

  async startTournament(gameSlug: string, config: Record<string, unknown>) {
    return apiFetch(`${BASE}/tournaments`, {
      method: "POST",
      body: { gameSlug, config },
      request: StartTournamentBodySchema,
      response: StartTournamentResponseSchema,
    });
  },

  async getTournament(id: string) {
    return apiFetch(`${BASE}/tournaments/${id}`, { response: TournamentDetailSchema });
  },

  async listTournaments(gameSlug?: string, status?: string) {
    const params = new URLSearchParams();
    if (gameSlug) params.set("gameSlug", gameSlug);
    if (status) params.set("status", status);
    const qs = params.toString();
    return apiFetch(`${BASE}/tournaments${qs ? `?${qs}` : ""}`, {
      response: TournamentSummaryListSchema,
    });
  },

  /**
   * EventSource — caller is responsible for parsing each event through
   * `TournamentStreamEventSchema` from `@boardgames/core/protocol`.
   * (Wrapping EventSource itself with schema parse lives in the consumer.)
   */
  streamProgress(id: string): EventSource {
    return new EventSource(apiUrl(`${BASE}/tournaments/${id}/stream`), {
      withCredentials: true,
    });
  },

  async abortTournament(id: string) {
    return apiFetch(`${BASE}/tournaments/${id}`, {
      method: "DELETE",
      response: OkResponseSchema,
    });
  },

  async getTournamentGames(id: string) {
    return apiFetch(`${BASE}/tournaments/${id}/games`, {
      response: TournamentGameLogListSchema,
    });
  },

  async getTournamentGame(tournamentId: string, gameIndex: number) {
    return apiFetch(`${BASE}/tournaments/${tournamentId}/games/${gameIndex}`, {
      response: TournamentGameSingleSchema,
    });
  },

  async getStrategies(gameSlug: string) {
    return apiFetch(`${BASE}/tournaments/strategies/${gameSlug}`, {
      response: StrategyListSchema,
    });
  },

  async saveGameResult(gameSlug: string, result: unknown) {
    return apiFetch(`${BASE}/games/${gameSlug}/results`, {
      method: "POST",
      body: result as Record<string, unknown>,
      response: SaveResultResponseSchema,
    });
  },

  async saveGameResultsBulk(gameSlug: string, records: unknown[]) {
    return apiFetch(`${BASE}/games/${gameSlug}/results/bulk`, {
      method: "POST",
      body: { records },
      request: BulkSaveResultsBodySchema,
      response: BulkSaveResultsResponseSchema,
    });
  },

  async getGameResults(gameSlug: string, limit?: number) {
    const params = limit ? `?limit=${limit}` : "";
    return apiFetch(`${BASE}/games/${gameSlug}/results${params}`, {
      response: GameResultListSchema,
    });
  },

  async clearGameResults(gameSlug: string) {
    return apiFetch(`${BASE}/games/${gameSlug}/results`, {
      method: "DELETE",
      response: OkResponseSchema,
    });
  },

  async getGameReplays(gameSlug: string) {
    return apiFetch(`${BASE}/games/${gameSlug}/replays`, {
      response: ReplaySummaryListSchema,
    });
  },

  async getGameReplay(gameSlug: string, id: number) {
    return apiFetch(`${BASE}/games/${gameSlug}/replays/${id}`, {
      response: ReplayLogSchema,
    });
  },
};
