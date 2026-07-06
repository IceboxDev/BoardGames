// Migration 0007 — D&D characters.
//
// Adds the `dnd_characters` table: one row per character-sheet PDF the DM
// uploads during campaign setup. Like `dnd_campaigns`, the row doubles as the
// extraction job (status: processing → ready | error); the extracted internal
// representation lands in `sheet_json` and the PDF bytes are never persisted.
// `user_id` denormalizes the owning DM (always the campaign's owner) so
// deletes can be ownership-scoped without a join.
//
// App-owned table, additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndCharacters: Migration = {
  version: 7,
  name: "dnd_characters",
  statements: [
    `CREATE TABLE IF NOT EXISTS dnd_characters (
       id TEXT PRIMARY KEY,
       campaign_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'processing',
       sheet_json TEXT,
       source_filename TEXT NOT NULL,
       source_size_bytes INTEGER NOT NULL,
       error TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_characters_campaign ON dnd_characters(campaign_id)`,
  ],
};
