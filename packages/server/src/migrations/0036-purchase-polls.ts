// Migration 0036 — "vote for the next game purchase" polls.
//
// An admin opens a poll over a set of catalog games; every player spends up
// to three votes, each on a distinct game (distinctness IS the composite PK —
// the 3-vote budget is a route-level count check, since SQLite can't express
// it as a constraint). The poll seals itself the moment the required number
// of distinct voters is reached; `closed_at`/`winner_slug` are stamped then.
//
// `purchase_poll_seen` powers the nagging greeting popup: `first_seen_at`
// distinguishes the one-time "new feature" framing from the repeat
// call-to-action variant, and `result_seen_at` makes the winner reveal a
// one-time card. Candidate slugs live as a JSON array validated at the API
// boundary (isCatalogSlug), kept CHECK-free like every other slug column so
// catalog changes never need a table rebuild.
//
// ON DELETE CASCADE throughout: votes and seen-state die with the poll and
// with the account.

import type { Migration } from "./types.ts";

export const purchasePolls: Migration = {
  version: 36,
  name: "purchase_polls",
  statements: [
    `CREATE TABLE IF NOT EXISTS purchase_polls (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       candidate_slugs_json TEXT NOT NULL,
       required_voters INTEGER NOT NULL,
       closed_at TEXT,
       winner_slug TEXT
     )`,
    `CREATE TABLE IF NOT EXISTS purchase_poll_votes (
       poll_id INTEGER NOT NULL REFERENCES purchase_polls(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       slug TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (poll_id, user_id, slug)
     )`,
    "CREATE INDEX IF NOT EXISTS idx_purchase_poll_votes_poll ON purchase_poll_votes(poll_id)",
    `CREATE TABLE IF NOT EXISTS purchase_poll_seen (
       poll_id INTEGER NOT NULL REFERENCES purchase_polls(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       first_seen_at TEXT,
       result_seen_at TEXT,
       PRIMARY KEY (poll_id, user_id)
     )`,
  ],
};
