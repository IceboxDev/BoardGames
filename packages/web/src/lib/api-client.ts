// Game-result and replay endpoints, typed by the schemas in
// `@boardgames/core/protocol`.

import {
  BulkSaveResultsBodySchema,
  BulkSaveResultsResponseSchema,
  GameResultListSchema,
  MatchSummaryListSchema,
  OkResponseSchema,
  ReplayLogSchema,
  type SaveResultBody,
  SaveResultBodySchema,
  SaveResultResponseSchema,
} from "@boardgames/core/protocol";
import { apiUrl } from "./api-base.ts";
import { apiFetch } from "./api-fetch.ts";

export type {
  BulkSaveResultsResponse,
  GameResult,
  MatchSummary,
} from "@boardgames/core/protocol";

const BASE = "/api";

export const apiClient = {
  async healthy(): Promise<boolean> {
    const res = await fetch(apiUrl(`${BASE}/health`), { credentials: "include" });
    return res.ok;
  },

  async saveGameResult(gameSlug: string, result: SaveResultBody) {
    return apiFetch(`${BASE}/games/${gameSlug}/results`, {
      method: "POST",
      body: result,
      request: SaveResultBodySchema,
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

  async getGameReplays(gameSlug: string, signal?: AbortSignal) {
    return apiFetch(`${BASE}/games/${gameSlug}/replays`, {
      response: MatchSummaryListSchema,
      signal,
    });
  },

  async getGameReplay(gameSlug: string, id: number) {
    return apiFetch(`${BASE}/games/${gameSlug}/replays/${id}`, {
      response: ReplayLogSchema,
    });
  },
};
