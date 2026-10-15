// Migration 0055 — the chess opening trainer.
//
// `chess_lichess_links`: the lichess account a member connected (verified once
// with their OAuth token, which is never stored). `chess_imported_games`: every
// standard game of that account, as compact UCI from the member's side.
// `chess_repertoires`: the member's opening trees (`RepertoireTreeSchema` in
// core/games/chess/trainer/tree.ts as `tree_json`), saved with a version for
// compare-and-swap between tabs.

import type { Migration } from "./types.ts";

export const chessTrainer: Migration = {
  version: 55,
  name: "chess_trainer",
  statements: [
    `CREATE TABLE IF NOT EXISTS chess_lichess_links (
       user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
       lichess_id TEXT NOT NULL,
       lichess_username TEXT NOT NULL,
       linked_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE TABLE IF NOT EXISTS chess_imported_games (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       game_id TEXT NOT NULL,
       color TEXT NOT NULL CHECK (color IN ('w', 'b')),
       uci TEXT NOT NULL,
       played_at_ms INTEGER NOT NULL,
       speed TEXT NOT NULL,
       rated INTEGER NOT NULL,
       result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
       opponent TEXT NOT NULL,
       opponent_rating INTEGER,
       PRIMARY KEY (user_id, game_id)
     )`,
    "CREATE INDEX IF NOT EXISTS chess_imported_games_color ON chess_imported_games(user_id, color, played_at_ms, game_id)",
    `CREATE TABLE IF NOT EXISTS chess_repertoires (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       color TEXT NOT NULL CHECK (color IN ('w', 'b')),
       status TEXT NOT NULL DEFAULT 'new',
       settings_json TEXT NOT NULL,
       tree_json TEXT,
       stats_json TEXT,
       version INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS chess_repertoires_user ON chess_repertoires(user_id, updated_at)",
  ],
};
