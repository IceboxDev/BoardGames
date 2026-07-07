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

/**
 * Un-log the most recent entry. Log actions land as batches (player action
 * + DM narration), so when the newest entry is a narration whose immediate
 * predecessor is the paired player-action/arrival line for the same node,
 * both are removed. Returns the number of entries removed.
 */
export async function undoLastHistory(partyId: string, userId: string): Promise<number> {
  const result = await getDb().execute({
    sql: `SELECT rowid AS rid, id, node_id, kind FROM dnd_history
          WHERE party_id = ? AND user_id = ? ORDER BY rowid DESC LIMIT 2`,
    args: [partyId, userId],
  });
  const last = result.rows[0];
  if (!last) return 0;
  const prev = result.rows[1];
  const ids = [String(last.id)];
  if (
    prev &&
    last.kind === "dm-narration" &&
    (prev.kind === "player-action" || prev.kind === "arrival") &&
    prev.node_id === last.node_id &&
    Number(prev.rid) === Number(last.rid) - 1
  ) {
    ids.push(String(prev.id));
  }
  await getDb().execute({
    sql: `DELETE FROM dnd_history WHERE id IN (${ids.map(() => "?").join(", ")})`,
    args: ids,
  });
  return ids.length;
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
