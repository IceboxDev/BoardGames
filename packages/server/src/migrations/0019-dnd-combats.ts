// Migration 0019 — the combat phase.
//
// • `dnd_combats` — one row per fight, attached to an initiative node. The
//   combatants (hp, conditions, positions, spent resources) live as JSON;
//   the referee model rewrites them turn by turn.
// • `dnd_characters.actions_json` — the character's combat action dashboard
//   (attack/spell/feature cards), generated once from the sheet and cached.
//
// Additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndCombats: Migration = {
  version: 19,
  name: "dnd_combats",
  statements: [
    `CREATE TABLE IF NOT EXISTS dnd_combats (
       id TEXT PRIMARY KEY,
       campaign_id TEXT NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
       party_id TEXT NOT NULL REFERENCES dnd_parties(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       node_id TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'active',
       round INTEGER NOT NULL DEFAULT 1,
       turn_index INTEGER NOT NULL DEFAULT 0,
       combatants_json TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_combats_party ON dnd_combats(party_id)`,
    `ALTER TABLE dnd_characters ADD COLUMN actions_json TEXT`,
  ],
};
