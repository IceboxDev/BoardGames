// D&D NPC persistence. NPCs are written in one batch by the campaign
// extraction job and only ever read per campaign; deletes cascade with the
// campaign. All access is user_id-scoped like the other dnd tables.

import { randomUUID } from "node:crypto";
import type { DndNpc, NpcSheet } from "@boardgames/core/protocol";
import { NpcSheetSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRows } from "./db-rows.ts";

const NpcRowSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  npc_json: jsonColumn(NpcSheetSchema),
});

export async function insertNpcs(
  campaignId: string,
  userId: string,
  npcs: NpcSheet[],
): Promise<void> {
  if (npcs.length === 0) return;
  await getDb().batch(
    npcs.map((npc) => ({
      sql: "INSERT INTO dnd_npcs (id, campaign_id, user_id, npc_json) VALUES (?, ?, ?, ?)",
      args: [randomUUID(), campaignId, userId, JSON.stringify(npc)],
    })),
    "write",
  );
}

export async function listNpcsForCampaign(campaignId: string, userId: string): Promise<DndNpc[]> {
  const result = await getDb().execute({
    sql: `SELECT id, campaign_id, npc_json FROM dnd_npcs
          WHERE campaign_id = ? AND user_id = ? ORDER BY created_at ASC, id ASC`,
    args: [campaignId, userId],
  });
  return parseRows(NpcRowSchema, result.rows, "dnd_npcs").map((row) => ({
    ...row.npc_json,
    id: row.id,
    campaignId: row.campaign_id,
  }));
}

/** Cascade used when a campaign is deleted. */
export async function deleteNpcsForCampaign(campaignId: string, userId: string): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM dnd_npcs WHERE campaign_id = ? AND user_id = ?",
    args: [campaignId, userId],
  });
}
