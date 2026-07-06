// Migration 0009 — idempotency key for recorded matches.
//
// `match_results` had no natural unique key (autoincrement id only), so a
// double-submit of the record-match form inserted a duplicate row. This adds an
// optional client-supplied `client_id` and a PARTIAL unique index over the
// non-null values, so a retried submit with the same id conflicts instead of
// duplicating. Rows without a client_id (the 47 existing rows, and any older
// client that doesn't send one) are excluded from the index and behave exactly
// as before — the column is additive and nullable.
//
// Mirrors the existing `game_results(game_slug, client_id)` unique-index pattern
// (baseline). App-owned, additive, idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const matchClientId: Migration = {
  version: 9,
  name: "match_client_id",
  statements: [
    "ALTER TABLE match_results ADD COLUMN client_id TEXT",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_match_results_client_id
       ON match_results(client_id) WHERE client_id IS NOT NULL`,
  ],
};
