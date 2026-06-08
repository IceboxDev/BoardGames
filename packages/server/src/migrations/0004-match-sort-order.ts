// Migration 0004 — per-night match ordering.
//
// Adds `match_results.sort_order` so admins can manually re-sort the games
// inside a single board game night (drag-and-drop in the history screen).
// Ascending `sort_order` = top of the list.
//
// Backfill preserves the existing display order (newest match first): within
// each night the newest match gets `sort_order = 0`. The night is identified by
// `date_key` using NULL-safe `IS`, so all standalone (NULL date_key) rows share
// one scope — harmless because standalone day-groups are not reorderable and
// keep rendering by `played_at DESC`, which agrees with this backfill.
//
// All statements run as ONE atomic libsql batch with the bookkeeping row, so the
// backfill cannot drift from the schema change.

import type { Migration } from "./types.ts";

export const matchSortOrder: Migration = {
  version: 4,
  name: "match_sort_order",
  statements: [
    `ALTER TABLE match_results ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
    // sort_order := number of matches in the same night that are *newer* than
    // this one (so the newest row → 0). Tie-break on id keeps it deterministic
    // when two matches share a played_at.
    `UPDATE match_results
     SET sort_order = (
       SELECT COUNT(*) FROM match_results AS m2
       WHERE m2.date_key IS match_results.date_key
         AND (m2.played_at > match_results.played_at
              OR (m2.played_at = match_results.played_at AND m2.id > match_results.id)))`,
    `CREATE INDEX IF NOT EXISTS idx_match_results_night_order ON match_results(date_key, sort_order)`,
  ],
};
