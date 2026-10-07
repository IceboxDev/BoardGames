// Migration 0049 — a log of every Quiztopia article read.
//
// `quiztopia_wiki_reads` holds one row per article: its LATEST read (a
// re-read overwrites `read_at`, an unmark deletes the row). The journal
// shows reads day by day, so every read is now also appended here. Unmarking
// a read removes the newest log row for that article (the mistaken read);
// earlier reads stay. Existing reads are copied in once, so the journal
// starts with what is already known. Purely additive.

import type { Migration } from "./types.ts";

export const quiztopiaWikiReadLog: Migration = {
  version: 49,
  name: "quiztopia_wiki_read_log",
  statements: [
    `CREATE TABLE IF NOT EXISTS quiztopia_wiki_read_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       set_id TEXT NOT NULL,
       read_at TEXT NOT NULL
     )`,
    "CREATE INDEX IF NOT EXISTS idx_quiztopia_wiki_read_log_user_time ON quiztopia_wiki_read_log(user_id, read_at)",
    `INSERT INTO quiztopia_wiki_read_log (user_id, set_id, read_at)
       SELECT user_id, set_id, read_at FROM quiztopia_wiki_reads`,
  ],
};
