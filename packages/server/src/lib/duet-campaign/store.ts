/**
 * Codenames: Duet campaigns (migration 0068). A campaign's progress is derived
 * from its game rows every time (`campaignProgress`); nothing else is stored,
 * so two players finishing at once, a retried write and a table record can
 * never disagree.
 */
import { randomUUID } from "node:crypto";
import { type CityId, CityIdSchema } from "@boardgames/core/games/codenames-duet/campaign/map";
import {
  type CampaignGameFact,
  campaignProgress,
} from "@boardgames/core/games/codenames-duet/campaign/progress";
import {
  type CampaignDetail,
  type CampaignGame,
  type CampaignGameMode,
  type CampaignMember,
  type CampaignPartner,
  type CampaignSummary,
  IsoTimestampSchema,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRow, parseRows } from "../db-rows.ts";

const CampaignRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  partner_kind: z.enum(["member", "ai", "guest"]),
  guest_name: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: IsoTimestampSchema,
  archived_at: z.string().nullable(),
});
type CampaignRow = z.infer<typeof CampaignRowSchema>;

const MemberRowSchema = z.object({
  campaign_id: z.string(),
  user_id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

const GameRowSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  city: CityIdSchema,
  won: z.number().int(),
  agents_found: z.number().int().nullable(),
  tokens_left: z.number().int().nullable(),
  mode: z.enum(["solo", "online", "table"]),
  replay_id: z.number().int().nullable(),
  played_at: IsoTimestampSchema,
  recorded_by: z.string().nullable(),
  note: z.string().nullable(),
});

const CAMPAIGN_COLUMNS =
  "c.id, c.name, c.partner_kind, c.guest_name, c.created_by, c.created_at, c.archived_at";

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

function toGame(row: z.infer<typeof GameRowSchema>): CampaignGame {
  return {
    id: row.id,
    city: row.city,
    won: row.won === 1,
    agentsFound: row.agents_found,
    tokensLeft: row.tokens_left,
    mode: row.mode,
    replayId: row.replay_id,
    playedAt: row.played_at,
    recordedBy: row.recorded_by,
    note: row.note,
  };
}

async function hydrate(db: Client, rows: readonly CampaignRow[]): Promise<CampaignDetail[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [memberResult, gameResult] = await db.batch(
    [
      {
        sql: `SELECT m.campaign_id, m.user_id, u.name, u.image
              FROM duet_campaign_members m JOIN "user" u ON u.id = m.user_id
              WHERE m.campaign_id IN (${placeholders(ids.length)})
              ORDER BY u.name COLLATE NOCASE`,
        args: ids,
      },
      {
        sql: `SELECT id, campaign_id, city, won, agents_found, tokens_left, mode, replay_id,
                     played_at, recorded_by, note
              FROM duet_campaign_games WHERE campaign_id IN (${placeholders(ids.length)})
              ORDER BY played_at, id`,
        args: ids,
      },
    ],
    "read",
  );
  const members = new Map<string, CampaignMember[]>();
  for (const m of parseRows(MemberRowSchema, memberResult?.rows ?? [], "duet_campaign_members")) {
    const list = members.get(m.campaign_id) ?? [];
    list.push({ userId: m.user_id, name: m.name, image: m.image });
    members.set(m.campaign_id, list);
  }
  const games = new Map<string, CampaignGame[]>();
  for (const g of parseRows(GameRowSchema, gameResult?.rows ?? [], "duet_campaign_games")) {
    const list = games.get(g.campaign_id) ?? [];
    list.push(toGame(g));
    games.set(g.campaign_id, list);
  }
  return rows.map((row) => {
    const list = games.get(row.id) ?? [];
    const progress = campaignProgress(list);
    return {
      id: row.id,
      name: row.name,
      partnerKind: row.partner_kind,
      guestName: row.guest_name,
      members: members.get(row.id) ?? [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      archived: row.archived_at !== null,
      cleared: progress.cleared.size,
      gamesPlayed: progress.gamesPlayed,
      wins: progress.wins,
      lastPlayedAt: list.at(-1)?.playedAt ?? null,
      games: list,
    };
  });
}

/** The member's campaigns, most recently played first. */
export async function listCampaigns(db: Client, userId: string): Promise<CampaignSummary[]> {
  const result = await db.execute({
    sql: `SELECT ${CAMPAIGN_COLUMNS} FROM duet_campaigns c
          JOIN duet_campaign_members m ON m.campaign_id = c.id
          WHERE m.user_id = ?`,
    args: [userId],
  });
  const details = await hydrate(db, parseRows(CampaignRowSchema, result.rows, "duet_campaigns"));
  return details
    .map(({ games: _games, ...summary }) => summary)
    .sort((a, b) => (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt));
}

/** One campaign in full — only for its members (`userId` null = any, for the server's own checks). */
export async function readCampaign(
  db: Client,
  id: string,
  userId: string | null,
): Promise<CampaignDetail | null> {
  const result = await db.execute({
    sql: `SELECT ${CAMPAIGN_COLUMNS} FROM duet_campaigns c WHERE c.id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  const [detail] = await hydrate(db, [parseRow(CampaignRowSchema, row, "duet_campaigns")]);
  if (!detail) return null;
  if (userId !== null && !detail.members.some((m) => m.userId === userId)) return null;
  return detail;
}

/** Members a campaign can be started with: every real (non-guest, non-internal) account. */
export async function listPartnerCandidates(
  db: Client,
): Promise<{ userId: string; name: string; image: string | null }[]> {
  const result = await db.execute(
    `SELECT id, name, image FROM "user" WHERE guest = 0 AND internal = 0
     ORDER BY name COLLATE NOCASE`,
  );
  return parseRows(
    z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }),
    result.rows,
    "user",
  ).map((u) => ({ userId: u.id, name: u.name, image: u.image }));
}

export type CreateCampaignResult =
  | { ok: true; id: string }
  | { ok: false; reason: "unknown-partner" | "self-partner" };

export async function createCampaign(
  db: Client,
  userId: string,
  input: { name: string; partner: CampaignPartner },
  now: Date = new Date(),
): Promise<CreateCampaignResult> {
  const { partner } = input;
  if (partner.kind === "member") {
    if (partner.userId === userId) return { ok: false, reason: "self-partner" };
    const found = await db.execute({
      sql: `SELECT 1 FROM "user" WHERE id = ? AND guest = 0 AND internal = 0`,
      args: [partner.userId],
    });
    if (found.rows.length === 0) return { ok: false, reason: "unknown-partner" };
  }
  const id = randomUUID();
  const at = now.toISOString();
  const members = partner.kind === "member" ? [userId, partner.userId] : [userId];
  await db.batch(
    [
      {
        sql: `INSERT INTO duet_campaigns (id, name, partner_kind, guest_name, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          input.name,
          partner.kind,
          partner.kind === "guest" ? partner.name : null,
          userId,
          at,
          at,
        ],
      },
      ...members.map((member) => ({
        sql: "INSERT INTO duet_campaign_members (campaign_id, user_id) VALUES (?, ?)",
        args: [id, member],
      })),
    ],
    "write",
  );
  return { ok: true, id };
}

export async function updateCampaign(
  db: Client,
  id: string,
  change: { name?: string; archived?: boolean },
  now: Date = new Date(),
): Promise<void> {
  const at = now.toISOString();
  if (change.name !== undefined) {
    await db.execute({
      sql: "UPDATE duet_campaigns SET name = ?, updated_at = ? WHERE id = ?",
      args: [change.name, at, id],
    });
  }
  if (change.archived !== undefined) {
    await db.execute({
      sql: "UPDATE duet_campaigns SET archived_at = ?, updated_at = ? WHERE id = ?",
      args: [change.archived ? at : null, at, id],
    });
  }
}

export interface NewCampaignGame {
  /** The session id (online/solo) or the client's id (table): a second write is ignored. */
  id: string;
  campaignId: string;
  city: CityId;
  won: boolean;
  agentsFound: number | null;
  tokensLeft: number | null;
  mode: CampaignGameMode;
  replayId: number | null;
  playedAt: Date;
  recordedBy: string | null;
  note: string | null;
}

/** Record a game; `false` when a game with this id was already recorded. */
export async function insertGame(db: Client, game: NewCampaignGame): Promise<boolean> {
  const result = await db.execute({
    sql: `INSERT INTO duet_campaign_games
            (id, campaign_id, city, won, agents_found, tokens_left, mode, replay_id, played_at, recorded_by, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING`,
    args: [
      game.id,
      game.campaignId,
      game.city,
      game.won ? 1 : 0,
      game.agentsFound,
      game.tokensLeft,
      game.mode,
      game.replayId,
      game.playedAt.toISOString(),
      game.recordedBy,
      game.note,
    ],
  });
  if (result.rowsAffected === 1) {
    await db.execute({
      sql: "UPDATE duet_campaigns SET updated_at = ? WHERE id = ?",
      args: [game.playedAt.toISOString(), game.campaignId],
    });
  }
  return result.rowsAffected === 1;
}

/** Undo a table record: only a table game, only by whoever recorded it. */
export async function deleteTableGame(
  db: Client,
  campaignId: string,
  gameId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.execute({
    sql: `DELETE FROM duet_campaign_games
          WHERE id = ? AND campaign_id = ? AND mode = 'table' AND recorded_by = ?`,
    args: [gameId, campaignId, userId],
  });
  return result.rowsAffected === 1;
}

/** The facts progress needs, for a campaign's server-side checks. */
export function gameFacts(detail: CampaignDetail): CampaignGameFact[] {
  return detail.games.map((g) => ({ city: g.city, won: g.won }));
}
