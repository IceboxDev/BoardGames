// Migration 0015 — D&D story-node templates.
//
// Adventure modules script their scenes as boxed read-aloud blocks. Campaign
// extraction now charts those blocks as per-waypoint TEMPLATE nodes; when a
// party is created its story tree is seeded from them (copied into
// `dnd_nodes`), so every group starts from the module's script and diverges
// from there. Templates are campaign-scoped and party-agnostic.
//
// Additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndNodeTemplates: Migration = {
  version: 15,
  name: "dnd_node_templates",
  statements: [
    `CREATE TABLE IF NOT EXISTS dnd_node_templates (
       id TEXT PRIMARY KEY,
       campaign_id TEXT NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       waypoint_index INTEGER NOT NULL,
       sort_order INTEGER NOT NULL DEFAULT 0,
       trigger_text TEXT NOT NULL,
       summary TEXT NOT NULL,
       read_text TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_node_templates_campaign
       ON dnd_node_templates(campaign_id)`,
  ],
};
