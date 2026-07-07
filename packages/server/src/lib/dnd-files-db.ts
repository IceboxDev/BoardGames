// Persisted D&D PDFs (modules, character sheets), stored as base64 chunks in
// Turso. Chunking keeps every request comfortably under the platform's
// per-payload limits: writes go one chunk per statement, reads page chunk by
// chunk. ~0.75 MB of base64 per row ≈ 27 rows for a 20 MB module.

import { randomUUID } from "node:crypto";
import type { DndFile, DndFileKind } from "@boardgames/core/protocol";
import { DndFileKindSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRow, parseRows } from "./db-rows.ts";

const CHUNK_SIZE = 750_000;

const FileRowSchema = z.object({
  id: z.string(),
  campaign_id: z.string().nullable(),
  kind: DndFileKindSchema,
  filename: z.string(),
  size_bytes: z.number().int().nonnegative(),
  created_at: z.string(),
});

function rowToFile(row: z.infer<typeof FileRowSchema>): DndFile {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: row.kind,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = "id, campaign_id, kind, filename, size_bytes, created_at";

/**
 * Store a PDF's base64 payload (no data-URI header). Chunks are written one
 * statement at a time — a single batch would exceed Turso's request cap for
 * large modules.
 */
export async function insertFile(args: {
  userId: string;
  campaignId: string | null;
  kind: DndFileKind;
  filename: string;
  base64: string;
  sizeBytes: number;
}): Promise<string> {
  const id = randomUUID();
  await getDb().execute({
    sql: `INSERT INTO dnd_files (id, user_id, campaign_id, kind, filename, size_bytes)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, args.userId, args.campaignId, args.kind, args.filename, args.sizeBytes],
  });
  for (let i = 0; i * CHUNK_SIZE < args.base64.length; i++) {
    await getDb().execute({
      sql: "INSERT INTO dnd_file_chunks (file_id, idx, data) VALUES (?, ?, ?)",
      args: [id, i, args.base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)],
    });
  }
  return id;
}

export async function listFilesForUser(userId: string): Promise<DndFile[]> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_files
          WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
    args: [userId],
  });
  return parseRows(FileRowSchema, result.rows, "dnd_files").map(rowToFile);
}

export async function getFileMeta(id: string, userId: string): Promise<DndFile | null> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_files WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToFile(parseRow(FileRowSchema, row, "dnd_files"));
}

/** Reassemble a stored file's base64 payload, chunk by chunk. */
/** Post-extraction rename: the ugly upload filename becomes the title. */
export async function renameFile(id: string, filename: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE dnd_files SET filename = ? WHERE id = ?",
    args: [filename, id],
  });
}

export async function getFileBase64(id: string, userId: string): Promise<string | null> {
  if (!(await getFileMeta(id, userId))) return null;
  const parts: string[] = [];
  for (let i = 0; ; i++) {
    const result = await getDb().execute({
      sql: "SELECT data FROM dnd_file_chunks WHERE file_id = ? AND idx = ?",
      args: [id, i],
    });
    const data = result.rows[0]?.data;
    if (typeof data !== "string") break;
    parts.push(data);
  }
  return parts.length > 0 ? parts.join("") : null;
}
