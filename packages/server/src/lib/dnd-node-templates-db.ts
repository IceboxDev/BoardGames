// D&D story-node templates: the module's read-aloud blocks, charted per
// waypoint at campaign extraction time. Templates form TREES — `parentIndex`
// points at another template's position in the same campaign's ordered list
// (null = a waypoint root). Party creation copies the whole structure into
// `dnd_nodes`, so every group starts from the module's script and diverges
// from there.

import { randomUUID } from "node:crypto";
import { NodeTypeSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRows } from "./db-rows.ts";
import type { ReadAloudBlock } from "./dnd-extract.ts";

const TemplateRowSchema = z.object({
  waypoint_index: z.number().int().nonnegative(),
  sort_order: z.number().int(),
  parent_sort: z.number().int().nullable(),
  node_type: NodeTypeSchema,
  trigger_text: z.string(),
  summary: z.string(),
  read_text: z.string(),
});

export async function replaceNodeTemplates(
  campaignId: string,
  userId: string,
  blocks: ReadAloudBlock[],
): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM dnd_node_templates WHERE campaign_id = ? AND user_id = ?",
    args: [campaignId, userId],
  });
  if (blocks.length === 0) return;
  await getDb().batch(
    blocks.map((block, i) => ({
      sql: `INSERT INTO dnd_node_templates
              (id, campaign_id, user_id, waypoint_index, sort_order, parent_sort,
               node_type, trigger_text, summary, read_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        campaignId,
        userId,
        block.waypointIndex,
        i,
        block.parentIndex,
        block.nodeType,
        block.trigger,
        block.summary,
        block.readText,
      ],
    })),
    "write",
  );
}

export async function listNodeTemplates(
  campaignId: string,
  userId: string,
): Promise<ReadAloudBlock[]> {
  const result = await getDb().execute({
    sql: `SELECT waypoint_index, sort_order, parent_sort, node_type, trigger_text, summary, read_text
          FROM dnd_node_templates
          WHERE campaign_id = ? AND user_id = ?
          ORDER BY sort_order ASC`,
    args: [campaignId, userId],
  });
  return parseRows(TemplateRowSchema, result.rows, "dnd_node_templates").map((row) => ({
    waypointIndex: row.waypoint_index,
    parentIndex: row.parent_sort,
    nodeType: row.node_type,
    trigger: row.trigger_text,
    summary: row.summary,
    readText: row.read_text,
  }));
}

/**
 * Copy a campaign's templates into a party's tree, reproducing the
 * hierarchy. Templates are ordered so parents precede children (enforced at
 * normalization); a dangling parentIndex degrades to a root.
 */
export async function seedPartyFromTemplates(
  campaignId: string,
  partyId: string,
  userId: string,
): Promise<number> {
  const templates = await listNodeTemplates(campaignId, userId);
  if (templates.length === 0) return 0;
  const idByIndex = new Map<number, string>();
  templates.forEach((_, i) => {
    idByIndex.set(i, randomUUID());
  });
  await getDb().batch(
    templates.map((t, i) => ({
      sql: `INSERT INTO dnd_nodes
              (id, campaign_id, party_id, user_id, waypoint_index, parent_id,
               node_type, trigger_text, summary, read_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        idByIndex.get(i) ?? randomUUID(),
        campaignId,
        partyId,
        userId,
        t.waypointIndex,
        t.parentIndex !== null ? (idByIndex.get(t.parentIndex) ?? null) : null,
        t.nodeType,
        t.trigger,
        t.summary,
        t.readText,
      ],
    })),
    "write",
  );
  return templates.length;
}
