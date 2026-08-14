// Migration 0027 — second-stage EXIT narrowing votes.
//
// When a sealed night's vote winner is the "exit" catalog entry, attendees
// narrow down WHICH EXIT box to play with a follow-up vote. One row per
// (night, user, box); the box slug is an `exit-*` slug from
// `@boardgames/core/games/exit-games` — validated at the API boundary, kept
// CHECK-free here like `game_requests.game_slug` so new boxes never need a
// table rebuild.
//
// ON DELETE CASCADE both ways: votes die with the night and with the account.

import type { Migration } from "./types.ts";

export const exitGameVotes: Migration = {
  version: 27,
  name: "exit_game_votes",
  statements: [
    `CREATE TABLE IF NOT EXISTS exit_game_votes (
       date_key TEXT NOT NULL REFERENCES locked_dates(date_key) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       exit_slug TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (date_key, user_id, exit_slug)
     )`,
    "CREATE INDEX IF NOT EXISTS idx_exit_game_votes_date ON exit_game_votes(date_key)",
  ],
};
