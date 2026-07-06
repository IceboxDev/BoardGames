// D&D party persistence. A campaign can be played by several groups at once;
// characters and story nodes hang off a party. FK cascades (0014) clean up
// characters/nodes when a party is deleted.

import { randomUUID } from "node:crypto";
import type { DndParty } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRow, parseRows } from "./db-rows.ts";

const PartyRowSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  name: z.string(),
  member_count: z.number().int().nonnegative(),
  created_at: z.string(),
});

function rowToParty(row: z.infer<typeof PartyRowSchema>): DndParty {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    memberCount: row.member_count,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_COUNT = `
  SELECT p.id, p.campaign_id, p.name, p.created_at,
         (SELECT COUNT(*) FROM dnd_characters ch
           WHERE ch.party_id = p.id AND ch.status = 'ready') AS member_count
  FROM dnd_parties p`;

export async function insertParty(args: {
  campaignId: string;
  userId: string;
  name: string;
}): Promise<DndParty> {
  const id = randomUUID();
  await getDb().execute({
    sql: "INSERT INTO dnd_parties (id, campaign_id, user_id, name) VALUES (?, ?, ?, ?)",
    args: [id, args.campaignId, args.userId, args.name],
  });
  const party = await getParty(id, args.userId);
  if (!party) throw new Error("dnd_parties insert not readable back");
  return party;
}

export async function listPartiesForCampaign(
  campaignId: string,
  userId: string,
): Promise<DndParty[]> {
  const result = await getDb().execute({
    sql: `${SELECT_WITH_COUNT} WHERE p.campaign_id = ? AND p.user_id = ?
          ORDER BY p.created_at ASC, p.id ASC`,
    args: [campaignId, userId],
  });
  return parseRows(PartyRowSchema, result.rows, "dnd_parties").map(rowToParty);
}

export async function getParty(id: string, userId: string): Promise<DndParty | null> {
  const result = await getDb().execute({
    sql: `${SELECT_WITH_COUNT} WHERE p.id = ? AND p.user_id = ?`,
    args: [id, userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToParty(parseRow(PartyRowSchema, row, "dnd_parties"));
}

export async function deleteParty(id: string, userId: string): Promise<boolean> {
  const result = await getDb().execute({
    sql: "DELETE FROM dnd_parties WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}
