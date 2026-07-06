// Migration 0006 — D&D campaigns.
//
// Adds the `dnd_campaigns` table backing the D&D DM tool: one row per uploaded
// adventure-module PDF. The row doubles as the extraction job — `status` moves
// processing → ready | error while a background task sends the PDF to OpenAI
// and stores the extracted title/tagline/setting/level range/checkpoints. The
// PDF bytes themselves are never persisted (Turso payload limits, and nothing
// re-reads them); only the filename and size are kept for display.
//
// App-owned table, additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndCampaigns: Migration = {
  version: 6,
  name: "dnd_campaigns",
  statements: [
    `CREATE TABLE IF NOT EXISTS dnd_campaigns (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'processing',
       title TEXT,
       tagline TEXT,
       setting TEXT,
       level_range TEXT,
       source_filename TEXT NOT NULL,
       source_size_bytes INTEGER NOT NULL,
       checkpoints_json TEXT NOT NULL DEFAULT '[]',
       error TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_campaigns_user ON dnd_campaigns(user_id)`,
  ],
};
