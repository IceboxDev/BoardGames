// Migration 0071 — an admin's notes on what a member still owes.
//
// The availability drawer lists what the app knows a member owes the group
// (RSVPs, picks, the purchase poll — `lib/member-outstanding.ts`). Some debts
// it can't see: money for a game, a box to bring back, a form to fill in.
// These free-text notes hold them, per member, shared between admins; ticking
// one off stamps `done_at` (kept, so a done list can be read back).
//
// Never shown to the member. ON DELETE CASCADE on the member; SET NULL on the
// admin who wrote it, like `admin_away_days.marked_by`.

import type { Migration } from "./types.ts";

export const adminMemberNotes: Migration = {
  version: 71,
  name: "admin_member_notes",
  statements: [
    `CREATE TABLE IF NOT EXISTS admin_member_notes (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       text TEXT NOT NULL,
       done_at TEXT,
       created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS idx_admin_member_notes_user ON admin_member_notes(user_id, done_at)",
  ],
};
