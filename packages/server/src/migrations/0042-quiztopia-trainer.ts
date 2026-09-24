// Migration 0042 — Quiztopia trainer.
//
// The trainer is an Anki-style daily flashcard programme over the 10,620
// transcribed Quiztopia questions. Its per-user scheduling state lives in
// ROWS, not a per-user JSON blob: the hub's twelve category tiles are one
// `GROUP BY category`, and a review touches exactly one `quiztopia_srs` row
// — a blob would turn every grade into a read-modify-write of the whole
// programme. Question ids are the content layer's positional ids
// (`c042-s07-q3`); they are never a foreign key because the content ships in
// code, not in the database, and a re-import pins ids so rows stay valid.
//
// `quiztopia_reviews` is the append-only log a review posts into. It is
// idempotent on `(user_id, client_id)` so an offline queue can replay
// without double-grading, records `prev_state` so "new cards introduced
// today" and 30-day retention are plain aggregates, and carries `applied`
// because two kinds of review are stored WITHOUT touching the schedule: a
// replay older than the row's last review, and a table-game answer while
// the member has not opted into games affecting their programme.
//
// `quiztopia_settings` keeps the two columns the queue needs as columns and
// the rest (`newPerDayByCategory`, `includeLeeches`, `gameReviewsAffectSrs`)
// as JSON validated at the API boundary, like `user_profiles.theme_json`.
// `quiztopia_wiki_reads` is the "read" tick on an article.
//
// Everything cascades with the account. Purely additive.

import type { Migration } from "./types.ts";

export const quiztopiaTrainer: Migration = {
  version: 42,
  name: "quiztopia_trainer",
  statements: [
    `CREATE TABLE IF NOT EXISTS quiztopia_srs (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       question_id TEXT NOT NULL,
       category INTEGER NOT NULL CHECK (category BETWEEN 1 AND 12),
       state TEXT NOT NULL CHECK (state IN ('new','learning','review','relearning')),
       ease REAL NOT NULL DEFAULT 2.5,
       interval_days INTEGER NOT NULL DEFAULT 0,
       due_date TEXT NOT NULL,
       reps INTEGER NOT NULL DEFAULT 0,
       lapses INTEGER NOT NULL DEFAULT 0,
       last_reviewed_at TEXT,
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, question_id)
     )`,
    "CREATE INDEX IF NOT EXISTS idx_quiztopia_srs_due ON quiztopia_srs(user_id, category, due_date)",
    `CREATE TABLE IF NOT EXISTS quiztopia_reviews (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       client_id TEXT NOT NULL,
       question_id TEXT NOT NULL,
       category INTEGER NOT NULL CHECK (category BETWEEN 1 AND 12),
       grade TEXT NOT NULL CHECK (grade IN ('again','good')),
       prev_state TEXT NOT NULL CHECK (prev_state IN ('new','learning','review','relearning')),
       source TEXT NOT NULL CHECK (source IN ('trainer','game')),
       applied INTEGER NOT NULL DEFAULT 1,
       reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
       local_date TEXT NOT NULL,
       duration_ms INTEGER,
       room_code TEXT
     )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_quiztopia_reviews_client ON quiztopia_reviews(user_id, client_id)",
    "CREATE INDEX IF NOT EXISTS idx_quiztopia_reviews_user_date ON quiztopia_reviews(user_id, local_date)",
    "CREATE INDEX IF NOT EXISTS idx_quiztopia_reviews_user_question ON quiztopia_reviews(user_id, question_id, id)",
    `CREATE TABLE IF NOT EXISTS quiztopia_settings (
       user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
       language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','de','both')),
       new_per_day INTEGER NOT NULL DEFAULT 10 CHECK (new_per_day BETWEEN 0 AND 50),
       settings_json TEXT NOT NULL DEFAULT '{}',
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE TABLE IF NOT EXISTS quiztopia_wiki_reads (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       set_id TEXT NOT NULL,
       read_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, set_id)
     )`,
  ],
};
