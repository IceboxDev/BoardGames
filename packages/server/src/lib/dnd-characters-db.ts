// D&D character persistence. One row per uploaded character-sheet PDF; the
// row doubles as the extraction job (status: processing → ready | error).
// Rows are scoped by user_id (the campaign's DM) — characters are only ever
// read in the context of a campaign the same user owns.

import type { CharacterSheet, DndCharacter } from "@boardgames/core/protocol";
import {
  CharacterSheetSchema,
  CharacterStateSchema,
  CharacterStatusSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";

const CharacterRowSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  party_id: z.string().nullable(),
  user_id: z.string(),
  status: CharacterStatusSchema,
  sheet_json: jsonColumn(CharacterSheetSchema).nullable(),
  state_json: jsonColumn(CharacterStateSchema).nullable().default(null),
  source_filename: z.string(),
  source_size_bytes: z.number().int().nonnegative(),
  error: z.string().nullable(),
  created_at: z.string(),
});
type CharacterRow = z.infer<typeof CharacterRowSchema>;

function rowToCharacter(row: CharacterRow): DndCharacter {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    partyId: row.party_id,
    status: row.status,
    sheet: row.sheet_json,
    state: row.state_json,
    sourceFilename: row.source_filename,
    sourceSizeBytes: row.source_size_bytes,
    error: row.error,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = `id, campaign_id, party_id, user_id, status, sheet_json, state_json,
   source_filename, source_size_bytes, error, created_at`;

export async function insertCharacter(args: {
  id: string;
  campaignId: string;
  partyId: string;
  userId: string;
  sourceFilename: string;
  sourceSizeBytes: number;
}): Promise<DndCharacter> {
  const result = await getDb().execute({
    sql: `INSERT INTO dnd_characters
            (id, campaign_id, party_id, user_id, source_filename, source_size_bytes)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING ${SELECT_COLUMNS}`,
    args: [
      args.id,
      args.campaignId,
      args.partyId,
      args.userId,
      args.sourceFilename,
      args.sourceSizeBytes,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error("dnd_characters insert returned no row");
  return rowToCharacter(parseRow(CharacterRowSchema, row, "dnd_characters"));
}

export async function listCharactersForParty(
  partyId: string,
  userId: string,
): Promise<DndCharacter[]> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_characters
          WHERE party_id = ? AND user_id = ? ORDER BY created_at ASC, id ASC`,
    args: [partyId, userId],
  });
  return parseRows(CharacterRowSchema, result.rows, "dnd_characters").map(rowToCharacter);
}

/** Link the stored PDF once the background job has persisted it. */
export async function setCharacterFile(id: string, fileId: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE dnd_characters SET file_id = ? WHERE id = ?",
    args: [fileId, id],
  });
}

export async function listCharactersForCampaign(
  campaignId: string,
  userId: string,
): Promise<DndCharacter[]> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_characters
          WHERE campaign_id = ? AND user_id = ? ORDER BY created_at ASC, id ASC`,
    args: [campaignId, userId],
  });
  return parseRows(CharacterRowSchema, result.rows, "dnd_characters").map(rowToCharacter);
}

export async function getCharacter(id: string, userId: string): Promise<DndCharacter | null> {
  const result = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM dnd_characters WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToCharacter(parseRow(CharacterRowSchema, row, "dnd_characters"));
}

export async function countCharactersForCampaign(
  campaignId: string,
  userId: string,
): Promise<number> {
  const result = await getDb().execute({
    sql: "SELECT COUNT(*) AS n FROM dnd_characters WHERE campaign_id = ? AND user_id = ?",
    args: [campaignId, userId],
  });
  return Number(result.rows[0]?.n ?? 0);
}

export async function setCharacterReady(id: string, sheet: CharacterSheet): Promise<void> {
  await getDb().execute({
    sql: `UPDATE dnd_characters
          SET status = 'ready', sheet_json = ?, error = NULL
          WHERE id = ?`,
    args: [JSON.stringify(sheet), id],
  });
}

export async function setCharacterState(
  id: string,
  state: import("@boardgames/core/protocol").CharacterState,
): Promise<void> {
  await getDb().execute({
    sql: "UPDATE dnd_characters SET state_json = ? WHERE id = ?",
    args: [JSON.stringify(state), id],
  });
}

export async function getCharacterActions(id: string): Promise<string | null> {
  const result = await getDb().execute({
    sql: "SELECT actions_json FROM dnd_characters WHERE id = ?",
    args: [id],
  });
  const raw = result.rows[0]?.actions_json;
  return typeof raw === "string" ? raw : null;
}

export async function setCharacterActions(id: string, actionsJson: string | null): Promise<void> {
  await getDb().execute({
    sql: "UPDATE dnd_characters SET actions_json = ? WHERE id = ?",
    args: [actionsJson, id],
  });
}

export async function setCharacterError(id: string, error: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE dnd_characters SET status = 'error', error = ? WHERE id = ?",
    args: [error, id],
  });
}

export async function deleteCharacter(id: string, userId: string): Promise<boolean> {
  const result = await getDb().execute({
    sql: "DELETE FROM dnd_characters WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}

/** Cascade used when a campaign is deleted — its characters go with it. */
export async function deleteCharactersForCampaign(
  campaignId: string,
  userId: string,
): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM dnd_characters WHERE campaign_id = ? AND user_id = ?",
    args: [campaignId, userId],
  });
}

/** Boot-time sweep — same contract as `markStaleProcessingCampaigns`. */
export async function markStaleProcessingCharacters(): Promise<void> {
  await getDb().execute(
    `UPDATE dnd_characters
     SET status = 'error',
         error = 'Extraction was interrupted by a server restart — delete this character and upload the sheet again.'
     WHERE status = 'processing'`,
  );
}
