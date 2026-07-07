// D&D campaign persistence. One row per uploaded module; the row doubles as
// the extraction job (status: processing → ready | error). All reads/writes
// are scoped by user_id — campaigns are private to the DM who created them.

import type { Campaign, CampaignCheckpoint } from "@boardgames/core/protocol";
import { CampaignCheckpointSchema, CampaignStatusSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";

const CampaignRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  status: CampaignStatusSchema,
  kind: z.string().nullable().default("campaign"),
  title: z.string().nullable(),
  tagline: z.string().nullable(),
  setting: z.string().nullable(),
  level_range: z.string().nullable(),
  source_filename: z.string(),
  source_size_bytes: z.number().int().nonnegative(),
  checkpoints_json: jsonColumn(z.array(CampaignCheckpointSchema)),
  error: z.string().nullable(),
  created_at: z.string(),
});
type CampaignRow = z.infer<typeof CampaignRowSchema>;

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    kind: row.kind === "one-shot" ? "one-shot" : "campaign",
    status: row.status,
    title: row.title,
    tagline: row.tagline,
    setting: row.setting,
    levelRange: row.level_range,
    sourceFilename: row.source_filename,
    sourceSizeBytes: row.source_size_bytes,
    checkpoints: row.checkpoints_json,
    error: row.error,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = `id, user_id, status, kind, title, tagline, setting, level_range,
   source_filename, source_size_bytes, checkpoints_json, error, created_at`;

export async function insertCampaign(args: {
  id: string;
  userId: string;
  sourceFilename: string;
  sourceSizeBytes: number;
}): Promise<Campaign> {
  const result = await getDb().execute({
    sql: `INSERT INTO dnd_campaigns (id, user_id, source_filename, source_size_bytes)
          VALUES (?, ?, ?, ?)
          RETURNING ${SELECT_COLUMNS}`,
    args: [args.id, args.userId, args.sourceFilename, args.sourceSizeBytes],
  });
  const row = result.rows[0];
  if (!row) throw new Error("dnd_campaigns insert returned no row");
  return rowToCampaign(parseRow(CampaignRowSchema, row, "dnd_campaigns"));
}

export async function listCampaignsForUser(userId: string): Promise<Campaign[]> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_campaigns
          WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
    args: [userId],
  });
  return parseRows(CampaignRowSchema, result.rows, "dnd_campaigns").map(rowToCampaign);
}

export async function getCampaign(id: string, userId: string): Promise<Campaign | null> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_campaigns WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToCampaign(parseRow(CampaignRowSchema, row, "dnd_campaigns"));
}

export async function countCampaignsForUser(userId: string): Promise<number> {
  const result = await getDb().execute({
    sql: "SELECT COUNT(*) AS n FROM dnd_campaigns WHERE user_id = ?",
    args: [userId],
  });
  return Number(result.rows[0]?.n ?? 0);
}

export async function setCampaignReady(
  id: string,
  extracted: {
    title: string;
    tagline: string | null;
    setting: string | null;
    levelRange: string | null;
    kind: "campaign" | "one-shot";
    checkpoints: CampaignCheckpoint[];
  },
): Promise<void> {
  await getDb().execute({
    sql: `UPDATE dnd_campaigns
          SET status = 'ready', title = ?, tagline = ?, setting = ?, level_range = ?, kind = ?,
              checkpoints_json = ?, error = NULL
          WHERE id = ?`,
    args: [
      extracted.title,
      extracted.tagline,
      extracted.setting,
      extracted.levelRange,
      extracted.kind,
      JSON.stringify(extracted.checkpoints),
      id,
    ],
  });
}

/** Link the stored module PDF once the background job has persisted it. */
export async function setCampaignFile(id: string, fileId: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE dnd_campaigns SET file_id = ? WHERE id = ?",
    args: [fileId, id],
  });
}

export async function getCampaignFileId(id: string, userId: string): Promise<string | null> {
  const result = await getDb().execute({
    sql: "SELECT file_id FROM dnd_campaigns WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  const fileId = result.rows[0]?.file_id;
  return typeof fileId === "string" ? fileId : null;
}

export async function setCampaignError(id: string, error: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE dnd_campaigns SET status = 'error', error = ? WHERE id = ?",
    args: [error, id],
  });
}

export async function deleteCampaign(id: string, userId: string): Promise<boolean> {
  const result = await getDb().execute({
    sql: "DELETE FROM dnd_campaigns WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}

/**
 * Boot-time sweep: any row still 'processing' when the server starts belonged
 * to a job the previous process never finished — flip it to a terminal error
 * so the client stops polling and the DM can delete + re-upload.
 */
export async function markStaleProcessingCampaigns(): Promise<void> {
  await getDb().execute(
    `UPDATE dnd_campaigns
     SET status = 'error',
         error = 'Extraction was interrupted by a server restart — delete this campaign and upload the tome again.'
     WHERE status = 'processing'`,
  );
}
