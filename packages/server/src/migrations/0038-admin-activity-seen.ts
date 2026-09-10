// Migration 0038 — per-admin "seen up to here" marker on member activity.
//
// The users-table bubble shows how much a member has done since THIS admin
// last opened their activity trail. One row per (admin, member) holding the
// newest activity_log id the admin was shown; the bubble is COUNT(rows with
// a greater id). Per admin rather than global because two admins look at
// different times — one clearing the other's bubble would make the count
// meaningless.
//
// ON DELETE CASCADE on both sides: a deleted admin takes their markers, a
// deleted member's marker goes with their (already cascaded) trail.

import type { Migration } from "./types.ts";

export const adminActivitySeen: Migration = {
  version: 38,
  name: "admin_activity_seen",
  statements: [
    `CREATE TABLE IF NOT EXISTS admin_activity_seen (
       admin_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       last_seen_id INTEGER NOT NULL,
       seen_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (admin_id, user_id)
     )`,
  ],
};
