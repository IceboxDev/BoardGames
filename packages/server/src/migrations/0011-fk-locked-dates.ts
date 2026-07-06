// Migration 0011 — foreign key on locked_dates.host_user_id.
//
// SQLite can't add a constraint in place, so this is the standard table
// rebuild: create the replacement with the FK, copy every row, drop the old,
// rename. `host_user_id` is ALREADY nullable, so `ON DELETE SET NULL` needs no
// schema/nullability change and no application-code change — deleting a user
// now nulls their hosted nights instead of leaving a dangling id.
//
// Done FIRST (before rsvps/game_requests gain a date_key FK to locked_dates in
// 0011's successor) so nothing references locked_dates while it's rebuilt.
// `locked_by` is deliberately left as an unenforced provenance string — an FK
// there would force it nullable (SET NULL) and ripple into row schemas.
//
// Verified against real prod data via `migrate:dry-run` (0 orphans, 0 FK
// violations after apply). The column list is transcribed exactly from the live
// schema so no column is dropped.

import type { Migration } from "./types.ts";

export const fkLockedDates: Migration = {
  version: 11,
  name: "fk_locked_dates",
  statements: [
    `CREATE TABLE locked_dates_new (
       date_key TEXT PRIMARY KEY,
       locked_by TEXT NOT NULL,
       locked_at TEXT NOT NULL DEFAULT (datetime('now')),
       expected_user_ids_json TEXT NOT NULL DEFAULT '[]',
       host_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       host_name TEXT,
       event_time TEXT,
       address TEXT,
       picks_locked_at TEXT,
       host_at_home INTEGER
     )`,
    `INSERT INTO locked_dates_new
       (date_key, locked_by, locked_at, expected_user_ids_json, host_user_id,
        host_name, event_time, address, picks_locked_at, host_at_home)
     SELECT date_key, locked_by, locked_at, expected_user_ids_json, host_user_id,
        host_name, event_time, address, picks_locked_at, host_at_home
     FROM locked_dates`,
    "DROP TABLE locked_dates",
    "ALTER TABLE locked_dates_new RENAME TO locked_dates",
  ],
};
