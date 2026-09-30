// Migration 0047 — activity rows sort by when the event happened.
//
// The trail used to sort by `id` (insertion order), which is only the event
// order if the inserts land in the order the events happened. They don't:
// `logActivity` is fire-and-forget, so two back-to-back requests race their
// INSERTs over the network to Turso, and rows written from different code
// paths (a mutation, the visit middleware, a page-view beacon) interleave
// arbitrarily. `created_at` can't break the tie — it has one-second
// resolution.
//
//   • `logged_at_ms` — epoch ms, stamped by the server when the event is
//     handled (strictly increasing within a process, see lib/activity-log.ts).
//     NULL on rows written before this migration, and on rows the previous
//     deployment writes between this migration (preDeployCommand) and the
//     cut-over.
//   • `sort_ms` — VIRTUAL generated column: `logged_at_ms`, else `created_at`
//     in ms. Old rows and stragglers get a sort key without a data-writing
//     backfill; `id` breaks ties inside a legacy second.
//
// The index serves the only read shape — one member's trail, newest first,
// keyset-paged on (sort_ms, id) — and the "last activity" probe the visit
// tracker runs after a restart. The (user_id, id DESC) index stays: the
// unseen-activity bubble still counts by id.
//
// Generated columns are skipped by the backup dumper (lib/backup.ts) — a
// restore recomputes them. Purely additive.

import type { Migration } from "./types.ts";

export const activityEventTime: Migration = {
  version: 47,
  name: "activity_event_time",
  statements: [
    "ALTER TABLE activity_log ADD COLUMN logged_at_ms INTEGER",
    `ALTER TABLE activity_log ADD COLUMN sort_ms INTEGER
       GENERATED ALWAYS AS (COALESCE(logged_at_ms, CAST(strftime('%s', created_at) AS INTEGER) * 1000)) VIRTUAL`,
    "CREATE INDEX IF NOT EXISTS idx_activity_log_user_sort ON activity_log(user_id, sort_ms DESC, id DESC)",
  ],
};
