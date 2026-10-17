// Migration 0057 — the chess opening trainer's folder library.
//
// `chess_trainer_library`: one document per member — their own named folders
// and saved lines under the White / Black roots (`LibrarySchema` in
// core/games/chess/trainer/library.ts as `doc_json`), saved whole with a
// version for compare-and-swap between tabs.

import type { Migration } from "./types.ts";

export const chessTrainerLibrary: Migration = {
  version: 57,
  name: "chess_trainer_library",
  statements: [
    `CREATE TABLE IF NOT EXISTS chess_trainer_library (
       user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
       doc_json TEXT NOT NULL,
       version INTEGER NOT NULL DEFAULT 1,
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  ],
};
