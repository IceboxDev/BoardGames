/**
 * A Duet game played as a campaign mission: checked before it starts (are
 * these players in the campaign, may they play this city now, and what are
 * its numbers) and recorded when it ends.
 */
import {
  CampaignMissionSchema,
  missionConfig,
} from "@boardgames/core/games/codenames-duet/campaign/map";
import { canAttempt } from "@boardgames/core/games/codenames-duet/campaign/progress";
import { DuetReplayLogSchema } from "@boardgames/core/games/codenames-duet/record";
import type { Client } from "@libsql/client";
import { z } from "zod";
import type { EndedGame, PreparedConfig, StartContext } from "../../games/registry.ts";
import { gameFacts, insertGame, readCampaign } from "./store.ts";

const WithCampaignSchema = z.object({ campaign: z.unknown() }).loose();

/**
 * `ServerGame.prepareConfig` for Duet. Options without a campaign pass
 * through untouched. With one, the mission's turns and mistakes come from the
 * map — whatever the client sent for them is replaced — and the game starts
 * only for the campaign's members, at a city they may play now.
 */
export async function prepareDuetConfig(
  db: Client,
  rawConfig: unknown,
  ctx: StartContext,
): Promise<PreparedConfig> {
  const parsed = WithCampaignSchema.safeParse(rawConfig);
  if (!parsed.success || parsed.data.campaign === undefined) return { ok: true, config: rawConfig };
  const mission = CampaignMissionSchema.safeParse(parsed.data.campaign);
  if (!mission.success) return { ok: false, reason: "That campaign mission doesn't exist" };

  if (ctx.humanUserIds.some((id) => id === null)) {
    return { ok: false, reason: "Sign in to play a campaign mission" };
  }
  const campaign = await readCampaign(db, mission.data.id, null);
  if (!campaign) return { ok: false, reason: "That campaign doesn't exist" };
  if (campaign.archived) return { ok: false, reason: "That campaign is archived" };
  const members = new Set(campaign.members.map((m) => m.userId));
  if (!ctx.humanUserIds.every((id) => id !== null && members.has(id))) {
    return { ok: false, reason: `Only the players of "${campaign.name}" can play its missions` };
  }
  if (!canAttempt(mission.data.city, gameFacts(campaign))) {
    return { ok: false, reason: "That mission isn't open yet — clear a city next to it first" };
  }
  return {
    ok: true,
    config: { ...parsed.data, campaign: mission.data, ...missionConfig(mission.data.city) },
  };
}

/** `afterGameOver` for Duet: a finished campaign mission becomes a game in its campaign. Idempotent. */
export async function recordDuetMission(db: Client, ended: EndedGame): Promise<void> {
  const log = DuetReplayLogSchema.safeParse(ended.replayLog);
  if (!log.success || !log.data.campaign) return;
  const { campaign, result } = log.data;
  const exists = await readCampaign(db, campaign.id, null);
  if (!exists) return;
  await insertGame(db, {
    id: ended.sessionId,
    campaignId: campaign.id,
    city: campaign.city,
    won: result.won,
    agentsFound: result.agentsFound,
    tokensLeft: result.tokensLeft,
    mode: ended.roomCode ? "online" : "solo",
    replayId: ended.replayId,
    playedAt: ended.endedAt,
    recordedBy: null,
    note: null,
  });
}
