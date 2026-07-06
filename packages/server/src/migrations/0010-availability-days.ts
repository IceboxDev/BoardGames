// Migration 0010 — normalize availability into one row per (user, date).
//
// `user_availability` stored a single JSON blob per user mapping every date to
// "can"/"maybe". That made "who can attend date X" an unindexable full-table
// JSON scan (available-games.ts, calendar-locks.ts) and turned the write into a
// whole-blob overwrite. This adds a proper relational table with a real FK to
// `user`, a CHECK on status, and an index on date_key so the date lookup is an
// index seek.
//
// EXPAND phase: the old `user_availability` table is left in place and kept in
// sync by a dual-write (see user-availability.ts) so a rollback of the read
// paths stays safe. A later CONTRACT migration drops it once this is proven.
//
// The backfill fans the JSON map out with json_each; only valid 'can'/'maybe'
// values migrate (a stale/garbage value is dropped rather than failing the
// CHECK). Additive; the FK backfill is validated against real prod data via
// `pnpm --filter @boardgames/server migrate:dry-run`.

import type { Migration } from "./types.ts";

export const availabilityDays: Migration = {
  version: 10,
  name: "availability_days",
  statements: [
    `CREATE TABLE IF NOT EXISTS user_availability_days (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       date_key TEXT NOT NULL,
       status TEXT NOT NULL CHECK (status IN ('can', 'maybe')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, date_key)
     )`,
    "CREATE INDEX IF NOT EXISTS idx_user_availability_days_date ON user_availability_days(date_key)",
    `INSERT OR IGNORE INTO user_availability_days (user_id, date_key, status, updated_at)
       SELECT ua.user_id, je.key, je.value, ua.updated_at
       FROM user_availability ua, json_each(ua.availability_json) je
       WHERE je.value IN ('can', 'maybe')`,
  ],
};
