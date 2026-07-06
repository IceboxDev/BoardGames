// The table history — the session log of everything actually spoken/done.
// Insertion order is the narrative order: reads sort by rowid so batched
// appends (player action + DM narration) keep their sequence within the
// same second.

import { randomUUID } from "node:crypto";
import type { DndHistoryEntry, HistoryKind } from "@boardgames/core/protocol";
import { HistoryKindSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRows } from "./db-rows.ts";

const HistoryRowSchema = z.object({
  id: z.string(),
  party_id: z.string(),
  node_id: z.string().nullable(),
  kind: HistoryKindSchema,
  text: z.string(),
  created_at: z.string(),
});

export async function appendHistory(
  campaignId: string,
  partyId: string,
  userId: string,
  entries: { kind: HistoryKind; text: string; nodeId: string | null }[],
): Promise<void> {
  if (entries.length === 0) return;
  await getDb().batch(
    entries.map((entry) => ({
      sql: `INSERT INTO dnd_history (id, campaign_id, party_id, user_id, node_id, kind, text)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), campaignId, partyId, userId, entry.nodeId, entry.kind, entry.text],
    })),
    "write",
  );
}

export async function listHistoryForParty(
  partyId: string,
  userId: string,
): Promise<DndHistoryEntry[]> {
  const result = await getDb().execute({
    sql: `SELECT id, party_id, node_id, kind, text, created_at FROM dnd_history
          WHERE party_id = ? AND user_id = ? ORDER BY rowid ASC`,
    args: [partyId, userId],
  });
  return parseRows(HistoryRowSchema, result.rows, "dnd_history").map((row) => ({
    id: row.id,
    partyId: row.party_id,
    nodeId: row.node_id,
    kind: row.kind,
    text: row.text,
    createdAt: row.created_at,
  }));
}
