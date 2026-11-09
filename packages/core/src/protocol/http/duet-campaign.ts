/**
 * Codenames: Duet campaigns — a pair working through the mission map
 * (`games/codenames-duet/campaign/`). A campaign belongs to its members (one
 * or two accounts); its progress is derived from its games, which come from
 * three places: a solo game against the AI partner, an online room, or a game
 * played at the table and recorded here.
 */

import { z } from "zod";
import { CityIdSchema } from "../../games/codenames-duet/campaign/map.ts";
import { IsoTimestampSchema } from "../common.ts";

export const CampaignIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Expected a campaign id");

/** Who plays alongside the campaign's creator. */
export const CampaignPartnerSchema = z.discriminatedUnion("kind", [
  /** Another member: the campaign is theirs too. */
  z.object({ kind: z.literal("member"), userId: z.string().min(1).max(64) }),
  /** The AI partner (solo games only). */
  z.object({ kind: z.literal("ai") }),
  /** Someone without an account: games are played at the table and recorded. */
  z.object({ kind: z.literal("guest"), name: z.string().trim().min(1).max(40) }),
]);
export type CampaignPartner = z.infer<typeof CampaignPartnerSchema>;

export const CampaignGameModeSchema = z.enum(["solo", "online", "table"]);
export type CampaignGameMode = z.infer<typeof CampaignGameModeSchema>;

export const CampaignGameSchema = z.object({
  id: z.string().min(1).max(64),
  city: CityIdSchema,
  won: z.boolean(),
  /** Agents found of 15; null when a table game didn't record it. */
  agentsFound: z.number().int().min(0).max(15).nullable(),
  tokensLeft: z.number().int().min(0).max(11).nullable(),
  mode: CampaignGameModeSchema,
  /** The saved online/solo game (`/play/codenames-duet/match-history/:id`). */
  replayId: z.number().int().nullable(),
  playedAt: IsoTimestampSchema,
  recordedBy: z.string().nullable(),
  note: z.string().nullable(),
});
export type CampaignGame = z.infer<typeof CampaignGameSchema>;

export const CampaignMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});
export type CampaignMember = z.infer<typeof CampaignMemberSchema>;

export const CampaignSummarySchema = z.object({
  id: CampaignIdSchema,
  name: z.string(),
  partnerKind: z.enum(["member", "ai", "guest"]),
  /** The guest partner's name (partnerKind "guest"). */
  guestName: z.string().nullable(),
  members: z.array(CampaignMemberSchema).min(1).max(2),
  createdBy: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  archived: z.boolean(),
  cleared: z.number().int().min(0).max(26),
  gamesPlayed: z.number().int().min(0),
  wins: z.number().int().min(0),
  lastPlayedAt: IsoTimestampSchema.nullable(),
});
export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(CampaignSummarySchema),
});

export const CampaignDetailSchema = CampaignSummarySchema.extend({
  /** Oldest first: the order they were played. */
  games: z.array(CampaignGameSchema),
});
export type CampaignDetail = z.infer<typeof CampaignDetailSchema>;

export const CampaignDetailResponseSchema = z.object({ campaign: CampaignDetailSchema });

export const CreateCampaignBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  partner: CampaignPartnerSchema,
});
export type CreateCampaignBody = z.infer<typeof CreateCampaignBodySchema>;

export const UpdateCampaignBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    archived: z.boolean().optional(),
  })
  .refine((b) => b.name !== undefined || b.archived !== undefined, "Nothing to change");

/** A mission played at the table, recorded by one of the campaign's members. */
export const RecordTableGameBodySchema = z.object({
  /** Client-made id, so a retried save records the game once. */
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Expected an 8–64 character id"),
  city: CityIdSchema,
  won: z.boolean(),
  agentsFound: z.number().int().min(0).max(15).optional(),
  tokensLeft: z.number().int().min(0).max(11).optional(),
  note: z.string().trim().max(300).optional(),
  /** When it was played; defaults to now. */
  playedAt: IsoTimestampSchema.optional(),
});
export type RecordTableGameBody = z.infer<typeof RecordTableGameBodySchema>;
