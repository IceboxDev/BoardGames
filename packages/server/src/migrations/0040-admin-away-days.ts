// Migration 0040 — an admin's "away" note on another member's calendar.
//
// The admin users table scores each member's availability coverage over
// every editable day, so a blank day reads the same whether the member
// can't come or simply hasn't opened the app. This table lets an admin note
// the former ("they saw the calendar and can't") per member and day. It is a
// reminder for admins only: it is never merged into availability, never
// shown to the member, and its single computed effect is that the day
// leaves the denominator of the member's coverage pie. A member's own
// can/maybe mark on the day wins over the note at read time.
//
// Shared between admins (one note per member/day; `marked_by` records who).
// ON DELETE CASCADE on the member: their notes go with them; SET NULL on the
// admin, like `ownership_announcements.resolved_by`.

import type { Migration } from "./types.ts";

export const adminAwayDays: Migration = {
  version: 40,
  name: "admin_away_days",
  statements: [
    `CREATE TABLE IF NOT EXISTS admin_away_days (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       date_key TEXT NOT NULL,
       marked_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, date_key)
     )`,
    "CREATE INDEX IF NOT EXISTS idx_admin_away_days_date ON admin_away_days(date_key)",
  ],
};
