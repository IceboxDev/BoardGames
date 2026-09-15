// Migration 0041 — private nights.
//
// A private night is a locked date reserved FOR a host: a fixed number of
// seats and a hand-picked guest list. The guest list reuses
// `expected_user_ids_json` — it already gates `POST /rsvp`, scopes the
// iCalendar feed, and is copied into the CANCELLED tombstone — so the only
// new state on the lock row is the flag, the seat count, how games get
// picked, and an optional title. Seating itself is never stored: it is the
// host plus the "yes" RSVPs in `rsvped_at` order, cut at `seat_count`, with
// the overflow as a waitlist that promotes by construction.
//
// `night_invite_seen` makes the "you're invited" greeting one-shot per
// (night, member); an RSVP either way retires the card as well, so the row
// only ever records a dismissal.
//
// Purely additive. Existing rows default to an open night, which is what
// every one of them is.

import type { Migration } from "./types.ts";

export const privateNights: Migration = {
  version: 41,
  name: "private_nights",
  statements: [
    "ALTER TABLE locked_dates ADD COLUMN private INTEGER NOT NULL DEFAULT 0",
    // Seats INCLUDING the host's own. NULL on open nights.
    "ALTER TABLE locked_dates ADD COLUMN seat_count INTEGER",
    // 'host': the host alone picks the lineup. 'group': seated players vote
    // exactly as on an open night.
    "ALTER TABLE locked_dates ADD COLUMN pick_mode TEXT NOT NULL DEFAULT 'group' CHECK (pick_mode IN ('group','host'))",
    "ALTER TABLE locked_dates ADD COLUMN title TEXT",
    // The tombstone mirrors what the feed needs to phrase a cancelled event.
    "ALTER TABLE calendar_unlocked_tombstones ADD COLUMN private INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calendar_unlocked_tombstones ADD COLUMN title TEXT",
    `CREATE TABLE IF NOT EXISTS night_invite_seen (
       date_key TEXT NOT NULL REFERENCES locked_dates(date_key) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       seen_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (date_key, user_id)
     )`,
  ],
};
