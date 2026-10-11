/**
 * Companion records: the finished games of the table companions the server
 * doesn't run (the Clocktower Grimoire, the D&D DM screen), one row per game
 * the recording member ran. Match History reads them for that member only.
 * See `CompanionRecordSchema` in core and migration 0053.
 */

import {
  type CompanionRecord,
  type CompanionRecordEntry,
  CompanionRecordSchema,
  type CompanionRecordSlug,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRow, parseRows } from "../lib/db-rows.ts";

export interface SavedCompanionRecord {
  readonly id: number;
  /** `false` when the client id was already recorded and this replaced it. */
  readonly created: boolean;
}

const IdRowSchema = z.object({ id: z.number().int() });

/**
 * Save `record` under the member's `clientId`: a new row the first time, the
 * same row replaced after that. Resolves to `null` when the id is already
 * taken by one of the member's records of ANOTHER game (never overwritten).
 */
export async function saveCompanionRecord(
  userId: string,
  clientId: string,
  record: CompanionRecord,
): Promise<SavedCompanionRecord | null> {
  const db = getDb();
  const json = JSON.stringify(record);
  const inserted = await db.execute({
    sql: `INSERT INTO companion_records (user_id, game_slug, client_id, record_json, started_at, ended_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, client_id) DO NOTHING
          RETURNING id`,
    args: [userId, record.game, clientId, json, record.startedAt, record.endedAt],
  });
  const fresh = inserted.rows[0];
  if (fresh) {
    return { id: parseRow(IdRowSchema, fresh, "companion_records.insert").id, created: true };
  }

  const updated = await db.execute({
    sql: `UPDATE companion_records
             SET record_json = ?, started_at = ?, ended_at = ?, updated_at = datetime('now')
           WHERE user_id = ? AND client_id = ? AND game_slug = ?
           RETURNING id`,
    args: [json, record.startedAt, record.endedAt, userId, clientId, record.game],
  });
  const replaced = updated.rows[0];
  if (!replaced) return null;
  return { id: parseRow(IdRowSchema, replaced, "companion_records.update").id, created: false };
}

const EntryRowSchema = z.object({
  id: z.number().int(),
  client_id: z.string(),
  created_at: z.string(),
  record_json: z.string(),
});

/**
 * The member's records of one game, newest first. A row whose JSON no longer
 * parses (a schema tightened since it was written) is skipped and logged, so
 * one bad row never takes the whole history down.
 */
export async function listCompanionRecords(
  userId: string,
  slug: CompanionRecordSlug,
  limit: number,
): Promise<CompanionRecordEntry[]> {
  const { rows } = await getDb().execute({
    sql: `SELECT id, client_id, created_at, record_json
            FROM companion_records
           WHERE user_id = ? AND game_slug = ?
           ORDER BY ended_at DESC, id DESC
           LIMIT ?`,
    args: [userId, slug, limit],
  });
  const entries: CompanionRecordEntry[] = [];
  for (const row of parseRows(EntryRowSchema, rows, "companion_records")) {
    let raw: unknown;
    try {
      raw = JSON.parse(row.record_json);
    } catch {
      raw = undefined;
    }
    const record = CompanionRecordSchema.safeParse(raw);
    if (!record.success) {
      console.error(`[companion-records] skipping unreadable record ${row.id}`);
      continue;
    }
    entries.push({
      id: row.id,
      clientId: row.client_id,
      recordedAt: row.created_at,
      record: record.data,
    });
  }
  return entries;
}
