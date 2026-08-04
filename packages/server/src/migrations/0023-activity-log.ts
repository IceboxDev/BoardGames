// Migration 0023 — member activity log.
//
// One row per loggable member action (login, site visit, RSVP, game vote,
// availability edit, profile view, …), written fire-and-forget by
// `lib/activity-log.ts` and read newest-first by the admin activity drawer.
// `type` is an open vocabulary owned by the server helper — adding a new
// event kind is a code change, not a schema change. `meta_json` carries the
// per-type payload (date keys, slugs, target user ids) and is rendered
// client-side; unknown types degrade to a generic label there.
//
// ON DELETE CASCADE: a deleted account takes its trail with it — the log
// exists for the admin's operational view, not as an audit archive that
// outlives the user.

import type { Migration } from "./types.ts";

export const activityLog: Migration = {
  version: 23,
  name: "activity_log",
  statements: [
    `CREATE TABLE IF NOT EXISTS activity_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       type TEXT NOT NULL,
       meta_json TEXT NOT NULL DEFAULT '{}',
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    // The only query shape is "this user's trail, newest first, keyset-paged
    // on id" — (user_id, id DESC) serves it without a sort step.
    `CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id, id DESC)`,
  ],
};
