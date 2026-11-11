// Migration 0069 — site hibernation.
//
// One row holds whether the whole site is asleep (`hibernated_at` set) and the
// group's totals frozen at that moment (`memorial_json`, shown on the goodbye
// screen). The log keeps every hibernate / wake for the admin card. Hibernating
// writes nothing else: nights, RSVPs, accounts and feed tokens are untouched,
// which is what makes waking a full restore.

import type { Migration } from "./types.ts";

export const siteHibernation: Migration = {
  version: 69,
  name: "site_hibernation",
  statements: [
    `CREATE TABLE IF NOT EXISTS site_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hibernated_at TEXT,
      hibernated_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      woken_at TEXT,
      memorial_json TEXT
    )`,
    "INSERT OR IGNORE INTO site_state (id) VALUES (1)",
    `CREATE TABLE IF NOT EXISTS site_state_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('hibernate', 'wake')),
      by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL
    )`,
  ],
};
