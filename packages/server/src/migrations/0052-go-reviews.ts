// Migration 0052 — KataGo reviews of Go games.
//
// One row per review: either a finished online match (`replay_id`, enqueued
// by Go's `afterGameOver`, one per match) or an SGF a member imported
// (`sgf`, `owner_user_id`). A single background runner (`games/go-reviews.ts`)
// takes `queued` rows oldest first, writes `progress` as it goes and the
// per-move analysis as `result_json` (`GoReviewAnalysisSchema` in
// core/protocol/http/go.ts). A row left `running` by a restart is re-queued.

import type { Migration } from "./types.ts";

export const goReviews: Migration = {
  version: 52,
  name: "go_reviews",
  statements: [
    `CREATE TABLE IF NOT EXISTS go_reviews (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
       replay_id INTEGER UNIQUE REFERENCES session_replays(id) ON DELETE CASCADE,
       sgf TEXT,
       status TEXT NOT NULL DEFAULT 'queued',
       progress REAL NOT NULL DEFAULT 0,
       result_json TEXT,
       error TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS go_reviews_status ON go_reviews(status, id)",
    "CREATE INDEX IF NOT EXISTS go_reviews_owner ON go_reviews(owner_user_id, created_at)",
  ],
};
