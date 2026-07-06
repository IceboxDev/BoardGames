// Migration 0008 — D&D NPCs.
//
// Adds the `dnd_npcs` table: NPC cards extracted from a campaign module's
// stat-block appendix during the same background job that charts checkpoints.
// No per-row status — NPCs ride the campaign's extraction job; a failed NPC
// pass yields no rows and the campaign still becomes ready.
//
// App-owned table, additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndNpcs: Migration = {
  version: 8,
  name: "dnd_npcs",
  statements: [
    `CREATE TABLE IF NOT EXISTS dnd_npcs (
       id TEXT PRIMARY KEY,
       campaign_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       npc_json TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_npcs_campaign ON dnd_npcs(campaign_id)`,
  ],
};
