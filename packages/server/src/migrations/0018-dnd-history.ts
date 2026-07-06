// Migration 0018 — the table history (session log).
//
// Every text the DM actually speaks to the party gets logged here (player
// action + DM narration pairs, waypoint arrivals, combat starts). The log is
// the ground truth of what the party knows — it renders as the History page,
// feeds the right-hand sidebar, and seeds generation context. Ordered by
// rowid (insertion order); batch appends stay in sequence.
//
// Additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndHistory: Migration = {
  version: 18,
  name: "dnd_history",
  statements: [
    `CREATE TABLE IF NOT EXISTS dnd_history (
       id TEXT PRIMARY KEY,
       campaign_id TEXT NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
       party_id TEXT NOT NULL REFERENCES dnd_parties(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       node_id TEXT,
       kind TEXT NOT NULL,
       text TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_history_party ON dnd_history(party_id)`,
  ],
};
