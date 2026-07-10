import type {
  ActiveBgaSessionResponse,
  BgaGame,
  BgaSessionByCodeResponse,
  CreateBgaSessionResponse,
} from "@boardgames/core/protocol";
import {
  ActiveBgaSessionResponseSchema,
  BgaSessionByCodeResponseSchema,
  CreateBgaSessionRequestSchema,
  CreateBgaSessionResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch";

/** BGA bridge session helpers — mirrors the beamer block in dnd-campaigns.ts. */

export function createBgaSession(game: BgaGame): Promise<CreateBgaSessionResponse> {
  return apiFetch("/api/bga/sessions", {
    method: "POST",
    body: { game },
    request: CreateBgaSessionRequestSchema,
    response: CreateBgaSessionResponseSchema,
  });
}

export function fetchActiveBgaSession(): Promise<ActiveBgaSessionResponse> {
  return apiFetch("/api/bga/sessions/active", {
    response: ActiveBgaSessionResponseSchema,
  });
}

export function bgaSessionByCode(code: string): Promise<BgaSessionByCodeResponse> {
  return apiFetch(`/api/bga/sessions/by-code/${encodeURIComponent(code.trim().toUpperCase())}`, {
    response: BgaSessionByCodeResponseSchema,
  });
}

/**
 * SSE stream of `BgaStreamEvent`s; the caller parses each frame. Same-origin
 * through the Vercel rewrite (the auth cookie lives on the app domain — the
 * same reason the beamer stream and game WebSockets avoid the Railway origin).
 */
export function streamBgaSession(sessionId: string, since?: number): EventSource {
  const query = since !== undefined ? `?since=${since}` : "";
  return new EventSource(`/api/bga/sessions/${sessionId}/stream${query}`, {
    withCredentials: true,
  });
}
