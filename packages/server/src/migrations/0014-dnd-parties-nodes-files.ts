// Migration 0014 — D&D parties, story nodes, and stored PDFs.
//
// Three new concerns for the DM tool:
//
// • `dnd_parties` — multiple groups can play the same campaign; characters
//   now belong to a party (nullable ALTER for pre-party rows, which simply
//   don't show up in any roster).
// • `dnd_nodes` — the story tree. Waypoints (checkpoints) act as folders;
//   each folder holds trees of nodes (parent_id NULL = a tree root). A node
//   is trigger (what the players did) + summary (the reaction, short) +
//   read_text (what the DM reads aloud). Trees are per party — two groups
//   running the same one-shot diverge. `trigger_text` because TRIGGER is an
//   SQL keyword.
// • `dnd_files` + `dnd_file_chunks` — uploaded PDFs (modules, character
//   sheets), stored as base64 chunks small enough for Turso's per-request
//   payload limits, so NPC extraction can be re-run without a re-upload and
//   the Sources screen can serve the documents back.
//
// New tables follow the FK conventions established in 0011–0013 (CASCADE on
// owner deletion). Additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndPartiesNodesFiles: Migration = {
  version: 14,
  name: "dnd_parties_nodes_files",
  statements: [
    `CREATE TABLE IF NOT EXISTS dnd_parties (
       id TEXT PRIMARY KEY,
       campaign_id TEXT NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_parties_campaign ON dnd_parties(campaign_id)`,
    `CREATE TABLE IF NOT EXISTS dnd_files (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       campaign_id TEXT REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
       kind TEXT NOT NULL,
       filename TEXT NOT NULL,
       size_bytes INTEGER NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_files_user ON dnd_files(user_id)`,
    `CREATE TABLE IF NOT EXISTS dnd_file_chunks (
       file_id TEXT NOT NULL REFERENCES dnd_files(id) ON DELETE CASCADE,
       idx INTEGER NOT NULL,
       data TEXT NOT NULL,
       PRIMARY KEY (file_id, idx)
     )`,
    `CREATE TABLE IF NOT EXISTS dnd_nodes (
       id TEXT PRIMARY KEY,
       campaign_id TEXT NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
       party_id TEXT NOT NULL REFERENCES dnd_parties(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       waypoint_index INTEGER NOT NULL,
       parent_id TEXT REFERENCES dnd_nodes(id) ON DELETE CASCADE,
       trigger_text TEXT NOT NULL,
       summary TEXT NOT NULL,
       read_text TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dnd_nodes_party ON dnd_nodes(party_id)`,
    `ALTER TABLE dnd_characters ADD COLUMN party_id TEXT REFERENCES dnd_parties(id) ON DELETE CASCADE`,
    `ALTER TABLE dnd_characters ADD COLUMN file_id TEXT`,
    `ALTER TABLE dnd_campaigns ADD COLUMN file_id TEXT`,
  ],
};
