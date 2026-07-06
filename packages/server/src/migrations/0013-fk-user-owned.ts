// Migration 0013 — foreign keys on the per-user singleton tables.
//
// user_inventory, user_profiles, dnd_campaigns are all owned by exactly one
// user (user_id, NOT NULL). ON DELETE CASCADE removes a deleted user's rows.
// No nullability/schema change, so no application-code change.
//
// user_inventory has ONE row whose user_id no longer exists in `user` (a
// deleted account's inventory). That orphan is deleted first — it references
// nothing and would otherwise fail the FK on rebuild. (dry-run confirmed it is
// the only one, and 0 across the other two tables.)
//
// Table rebuilds; the dnd_campaigns user index is recreated. Column lists are
// transcribed from the live schema. No table references any of these (verified
// no inbound FKs), so the drop/rename is safe. Validated via `migrate:dry-run`.

import type { Migration } from "./types.ts";

export const fkUserOwned: Migration = {
  version: 13,
  name: "fk_user_owned",
  statements: [
    // ── user_inventory (clean the lone orphan, then rebuild) ───────────
    `DELETE FROM user_inventory WHERE user_id NOT IN (SELECT id FROM "user")`,
    `CREATE TABLE user_inventory_new (
       user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
       game_slugs_json TEXT NOT NULL,
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `INSERT INTO user_inventory_new (user_id, game_slugs_json, updated_at)
     SELECT user_id, game_slugs_json, updated_at FROM user_inventory`,
    "DROP TABLE user_inventory",
    "ALTER TABLE user_inventory_new RENAME TO user_inventory",
    // ── user_profiles ──────────────────────────────────────────────────
    `CREATE TABLE user_profiles_new (
       user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
       tagline TEXT,
       bio TEXT,
       pronouns TEXT,
       location TEXT,
       accent_hex TEXT,
       favorite_game_slugs_json TEXT NOT NULL DEFAULT '[]',
       wishlist_game_slugs_json TEXT NOT NULL DEFAULT '[]',
       links_json TEXT NOT NULL DEFAULT '[]',
       skill_json TEXT,
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `INSERT INTO user_profiles_new
       (user_id, tagline, bio, pronouns, location, accent_hex,
        favorite_game_slugs_json, wishlist_game_slugs_json, links_json, skill_json, updated_at)
     SELECT user_id, tagline, bio, pronouns, location, accent_hex,
        favorite_game_slugs_json, wishlist_game_slugs_json, links_json, skill_json, updated_at
     FROM user_profiles`,
    "DROP TABLE user_profiles",
    "ALTER TABLE user_profiles_new RENAME TO user_profiles",
    // ── dnd_campaigns ──────────────────────────────────────────────────
    `CREATE TABLE dnd_campaigns_new (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
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
    `INSERT INTO dnd_campaigns_new
       (id, user_id, status, title, tagline, setting, level_range,
        source_filename, source_size_bytes, checkpoints_json, error, created_at)
     SELECT id, user_id, status, title, tagline, setting, level_range,
        source_filename, source_size_bytes, checkpoints_json, error, created_at
     FROM dnd_campaigns`,
    "DROP TABLE dnd_campaigns",
    "ALTER TABLE dnd_campaigns_new RENAME TO dnd_campaigns",
    "CREATE INDEX idx_dnd_campaigns_user ON dnd_campaigns(user_id)",
  ],
};
