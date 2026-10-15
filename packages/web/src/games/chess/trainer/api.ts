// Typed access to `/api/trainers/chess/*` through the protocol schemas.

import type { ImportedGame } from "@boardgames/core/games/chess/trainer/imported-game";
import type { RepertoireTree, TreeSettings } from "@boardgames/core/games/chess/trainer/tree";
import {
  ChessGamesPageSchema,
  ChessLinkBodySchema,
  ChessLinkResponseSchema,
  type ChessTrainerGame,
  ChessUploadGamesBodySchema,
  ChessUploadGamesResponseSchema,
  CreateRepertoireBodySchema,
  RepertoireListSchema,
  RepertoireSchema,
  UpdateRepertoireBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { apiFetch } from "../../../lib/api-fetch";
import { jsonQuery } from "../../../lib/typed-query";

const BASE = "/api/trainers/chess";

export const chessKeys = {
  link: ["chess-trainer", "link"] as const,
  repertoires: ["chess-trainer", "repertoires"] as const,
  repertoire: (id: string) => ["chess-trainer", "repertoire", id] as const,
};

export const linkQuery = jsonQuery(`${BASE}/link`, ChessLinkResponseSchema);
export const repertoiresQuery = jsonQuery(`${BASE}/repertoires`, RepertoireListSchema);
export const repertoireQuery = (id: string) =>
  jsonQuery(`${BASE}/repertoires/${encodeURIComponent(id)}`, RepertoireSchema);

export const linkAccount = (token: string) =>
  apiFetch(`${BASE}/link`, {
    method: "POST",
    body: { token },
    request: ChessLinkBodySchema,
    response: ChessLinkResponseSchema,
  });

export const unlinkAccount = () =>
  apiFetch(`${BASE}/link`, { method: "DELETE", response: ChessLinkResponseSchema });

export const uploadGames = (games: ImportedGame[]) =>
  apiFetch(`${BASE}/games`, {
    method: "POST",
    body: { games },
    request: ChessUploadGamesBodySchema,
    response: ChessUploadGamesResponseSchema,
  });

/** Every stored game you played as `color`, oldest first. */
export async function fetchAllGames(
  color: "w" | "b",
  signal?: AbortSignal,
): Promise<ChessTrainerGame[]> {
  const out: ChessTrainerGame[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ color });
    if (cursor) q.set("cursor", cursor);
    const page = await apiFetch(`${BASE}/games?${q}`, { response: ChessGamesPageSchema, signal });
    out.push(...page.games);
    cursor = page.next;
  } while (cursor);
  return out;
}

export const createRepertoire = (body: {
  name: string;
  color: "w" | "b";
  settings: TreeSettings;
}) =>
  apiFetch(`${BASE}/repertoires`, {
    method: "POST",
    body,
    request: CreateRepertoireBodySchema,
    response: RepertoireSchema,
  });

export const saveRepertoire = (
  id: string,
  body: { expectedVersion: number; name?: string; settings?: TreeSettings; tree?: RepertoireTree },
) =>
  apiFetch(`${BASE}/repertoires/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
    request: UpdateRepertoireBodySchema,
    response: RepertoireSchema,
  });

export const deleteRepertoire = (id: string) =>
  apiFetch(`${BASE}/repertoires/${encodeURIComponent(id)}`, {
    method: "DELETE",
    response: z.unknown(),
  });
