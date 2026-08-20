import {
  type GreetingAckBody,
  GreetingAckBodySchema,
  GreetingAckResponseSchema,
  type GreetingResponse,
  GreetingResponseSchema,
  type PlayerSkillResponse,
  PlayerSkillResponseSchema,
  type SkillLeaderboardsResponse,
  SkillLeaderboardsResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export async function fetchPlayerSkill(
  userId: string,
  signal?: AbortSignal,
): Promise<PlayerSkillResponse> {
  return apiFetch(`/api/skills/players/${encodeURIComponent(userId)}`, {
    response: PlayerSkillResponseSchema,
    signal,
  });
}

export async function fetchSkillLeaderboards(
  signal?: AbortSignal,
): Promise<SkillLeaderboardsResponse> {
  return apiFetch("/api/skills/leaderboards", {
    response: SkillLeaderboardsResponseSchema,
    signal,
  });
}

/** The one celebratory takeover this viewer still owes a look at, if any. */
export async function fetchGreeting(signal?: AbortSignal): Promise<GreetingResponse> {
  return apiFetch("/api/skills/greeting", { response: GreetingResponseSchema, signal });
}

export async function ackGreeting(body: GreetingAckBody): Promise<void> {
  await apiFetch("/api/skills/greeting/ack", {
    method: "POST",
    request: GreetingAckBodySchema,
    body,
    response: GreetingAckResponseSchema,
  });
}
