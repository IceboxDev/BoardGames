import {
  type BalanceTeamsBody,
  BalanceTeamsBodySchema,
  type BalanceTeamsResponse,
  BalanceTeamsResponseSchema,
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

/** The team mixer's fairest split for one game (strengths stay on the server). */
export async function balanceTeams(
  body: BalanceTeamsBody,
  signal?: AbortSignal,
): Promise<BalanceTeamsResponse> {
  return apiFetch("/api/skills/balance-teams", {
    method: "POST",
    request: BalanceTeamsBodySchema,
    body,
    response: BalanceTeamsResponseSchema,
    signal,
  });
}

// The greeting fetchers moved to `lib/greetings.ts` — the queue is app-wide
// now (`/api/greetings`), not a skills feature.
