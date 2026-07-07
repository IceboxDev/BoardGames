// D&D story-node persistence. Nodes form per-party trees inside waypoint
// "folders" (waypoint_index = position in the campaign's checkpoint list).
// The whole party's node set is small enough to load at once; tree assembly
// (children lookup, ancestor walks) happens in the caller.

import { randomUUID } from "node:crypto";
import type { DndNode } from "@boardgames/core/protocol";
import { DangerTableSchema, NodeTypeSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";

const NodeRowSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  party_id: z.string(),
  waypoint_index: z.number().int().nonnegative(),
  parent_id: z.string().nullable(),
  node_type: NodeTypeSchema,
  danger_table_json: jsonColumn(DangerTableSchema).nullable(),
  trigger_text: z.string(),
  summary: z.string(),
  read_text: z.string(),
  created_at: z.string(),
});

function rowToNode(row: z.infer<typeof NodeRowSchema>): DndNode {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    partyId: row.party_id,
    waypointIndex: row.waypoint_index,
    parentId: row.parent_id,
    nodeType: row.node_type,
    dangerTable: row.danger_table_json,
    trigger: row.trigger_text,
    summary: row.summary,
    readText: row.read_text,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = `id, campaign_id, party_id, waypoint_index, parent_id,
   node_type, danger_table_json, trigger_text, summary, read_text, created_at`;

export async function insertNode(args: {
  campaignId: string;
  partyId: string;
  userId: string;
  waypointIndex: number;
  parentId: string | null;
  nodeType: "story" | "initiative";
  dangerTable: import("@boardgames/core/protocol").DangerTable | null;
  trigger: string;
  summary: string;
  readText: string;
}): Promise<DndNode> {
  const id = randomUUID();
  const result = await getDb().execute({
    sql: `INSERT INTO dnd_nodes
            (id, campaign_id, party_id, user_id, waypoint_index, parent_id,
             node_type, danger_table_json, trigger_text, summary, read_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING ${SELECT_COLUMNS}`,
    args: [
      id,
      args.campaignId,
      args.partyId,
      args.userId,
      args.waypointIndex,
      args.parentId,
      args.nodeType,
      args.dangerTable ? JSON.stringify(args.dangerTable) : null,
      args.trigger,
      args.summary,
      args.readText,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error("dnd_nodes insert returned no row");
  return rowToNode(parseRow(NodeRowSchema, row, "dnd_nodes"));
}

/** Post-combat conversion: the fight is over, the node becomes a normal
 * story node ("Defeat the dead vines") that can grow children. */
export async function convertNodeToStory(
  id: string,
  userId: string,
  trigger: string,
): Promise<void> {
  await getDb().execute({
    sql: `UPDATE dnd_nodes SET node_type = 'story', trigger_text = ?
          WHERE id = ? AND user_id = ?`,
    args: [trigger, id, userId],
  });
}

export async function listNodesForParty(partyId: string, userId: string): Promise<DndNode[]> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_nodes
          WHERE party_id = ? AND user_id = ? ORDER BY created_at ASC, id ASC`,
    args: [partyId, userId],
  });
  return parseRows(NodeRowSchema, result.rows, "dnd_nodes").map(rowToNode);
}
