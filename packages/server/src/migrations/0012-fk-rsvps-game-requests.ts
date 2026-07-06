// Migration 0012 — foreign keys on rsvps and game_requests.
//
// Both are leaf tables: user_id -> user and date_key -> locked_dates, both
// NOT NULL, so ON DELETE CASCADE fits without any nullability/schema change.
// CASCADE matches existing behavior exactly — the unlock handler already
// deletes a date's rsvps and game_requests before deleting its locked_dates
// row (calendar-locks.ts DELETE /lock), and deleting a user should take their
// rsvps and votes with them. The manual deletes in the unlock path become
// redundant but stay harmless.
//
// Table rebuild (SQLite can't add constraints in place); the date index is
// recreated after the rename. Column lists + CHECKs are transcribed from the
// live schema. Validated against prod data via `migrate:dry-run`.

import type { Migration } from "./types.ts";

export const fkRsvpsGameRequests: Migration = {
  version: 12,
  name: "fk_rsvps_game_requests",
  statements: [
    // ── rsvps ──────────────────────────────────────────────────────────
    `CREATE TABLE rsvps_new (
       date_key TEXT NOT NULL REFERENCES locked_dates(date_key) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       status TEXT NOT NULL CHECK (status IN ('yes', 'no')),
       rsvped_at TEXT NOT NULL DEFAULT (datetime('now')),
       auto INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (date_key, user_id)
     )`,
    `INSERT INTO rsvps_new (date_key, user_id, status, rsvped_at, auto)
     SELECT date_key, user_id, status, rsvped_at, auto FROM rsvps`,
    "DROP TABLE rsvps",
    "ALTER TABLE rsvps_new RENAME TO rsvps",
    "CREATE INDEX idx_rsvps_date ON rsvps(date_key)",
    // ── game_requests ──────────────────────────────────────────────────
    `CREATE TABLE game_requests_new (
       date_key TEXT NOT NULL REFERENCES locked_dates(date_key) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       game_slug TEXT NOT NULL,
       reaction TEXT NOT NULL CHECK (reaction IN ('hype', 'teach', 'learn')),
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (date_key, user_id, game_slug, reaction)
     )`,
    `INSERT INTO game_requests_new (date_key, user_id, game_slug, reaction, created_at)
     SELECT date_key, user_id, game_slug, reaction, created_at FROM game_requests`,
    "DROP TABLE game_requests",
    "ALTER TABLE game_requests_new RENAME TO game_requests",
    "CREATE INDEX idx_game_requests_date ON game_requests(date_key)",
  ],
};
