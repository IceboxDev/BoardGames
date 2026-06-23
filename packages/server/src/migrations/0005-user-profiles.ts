// Migration 0005 — user profiles.
//
// Adds the `user_profiles` table backing the public profile page: the small set
// of fields a user can edit about themselves (tagline, bio, accent, favorites,
// wishlist, links) plus a nullable `skill_json` for the data-driven hexagonal
// skill chart (generated later). Everything else a profile shows — library,
// match history, stats, next game night — is aggregated from existing tables,
// so this is the only new table the feature needs.
//
// App-owned table (not part of the better-auth baseline), so there is no
// BASELINE_TABLES entry to update. Additive and idempotent — safe on the live
// database. One row per user, created lazily on first save.

import type { Migration } from "./types.ts";

export const userProfiles: Migration = {
  version: 5,
  name: "user_profiles",
  statements: [
    `CREATE TABLE IF NOT EXISTS user_profiles (
       user_id TEXT PRIMARY KEY,
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
  ],
};
