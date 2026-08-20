// Migration 0035 — unlocking a night stops destroying its history.
//
// `DELETE /api/admin/calendar/lock` used to run:
//
//     DELETE FROM rsvps         WHERE date_key = ?
//     DELETE FROM game_requests WHERE date_key = ?
//     DELETE FROM locked_dates  WHERE date_key = ?
//
// — and the third statement alone would have done it, because migrations 0012
// and 0027 put ON DELETE CASCADE on `rsvps`, `game_requests` and
// `exit_game_votes`. One admin click therefore permanently erased who had
// committed to a night, every game vote cast for it, and every EXIT-box vote,
// with no undo and no backup taken.
//
// That is not a cosmetic loss. `lib/nights-attended.ts` derives "nights
// attended" from `locked_dates` (the denominator) and `rsvps` (the evidence),
// so unlocking a night that had already happened silently rewrote every
// member's attendance record — and re-locking could not restore it, because
// the rows were gone. `match_results.date_key` has no FK, so any match already
// recorded against the night was left pointing at nothing.
//
// `unlocked_at` replaces the delete with a mark. Every read that means "is this
// night on?" filters `unlocked_at IS NULL`, so an unlocked night is exactly as
// invisible as it was before; `POST /lock` clears the mark, so re-locking now
// restores the guest list, the RSVPs and the votes as they were.
//
// Purely additive: one nullable column, no backfill, no rewrite. Existing rows
// default to NULL, i.e. active, which is correct for all of them — nights
// unlocked before this migration were hard-deleted and are not coming back.
// The `calendar_unlocked_tombstones` row the unlock path writes for the
// iCalendar CANCELLED event is unchanged and still the feed's only source for
// a cancelled night.

import type { Migration } from "./types.ts";

export const lockedDatesSoftUnlock: Migration = {
  version: 35,
  name: "locked_dates_soft_unlock",
  statements: [
    "ALTER TABLE locked_dates ADD COLUMN unlocked_at TEXT",
    // Every hot read is "the active nights" — either the whole set (the
    // calendar) or one date (`WHERE date_key = ? AND unlocked_at IS NULL`).
    // A partial index over just the live rows keeps that a seek and stays
    // small: unlocked nights are rare and never appear in it.
    `CREATE INDEX IF NOT EXISTS idx_locked_dates_active
       ON locked_dates(date_key) WHERE unlocked_at IS NULL`,
  ],
};
