import {
  type PlayerSkillResponse,
  PlayerSkillResponseSchema,
  SkillIntroAckResponseSchema,
  type SkillIntroResponse,
  SkillIntroResponseSchema,
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

export async function fetchSkillIntro(signal?: AbortSignal): Promise<SkillIntroResponse> {
  return apiFetch("/api/skills/intro", { response: SkillIntroResponseSchema, signal });
}

export async function ackSkillIntro(): Promise<void> {
  await apiFetch("/api/skills/intro-ack", {
    method: "POST",
    response: SkillIntroAckResponseSchema,
  });
}
