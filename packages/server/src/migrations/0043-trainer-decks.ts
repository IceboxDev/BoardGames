// Migration 0043 — trainer decks (World Geography, and every quiz trainer
// after it).
//
// Quiztopia's trainer tables are shaped around its 12 categories and
// question ids. The trainers that follow share one generic set instead,
// keyed by a `deck` ("geography", …): the same Anki-style schedule rows, the
// same idempotent review log, a settings blob per deck. Card ids are the
// deck's own (`co:DEU:locate`); like Quiztopia's they are never a foreign
// key, because the content ships in code.
//
// `trainer_reviews.outcome_json` keeps what the answer WAS (the click's
// distance, the typed text, the place confused with), so misses can be
// analysed later without a schema change. `source = 'drill'` marks free
// practice that only reschedules a card when it was due anyway.
//
// Everything cascades with the account. Purely additive.

import type { Migration } from "./types.ts";

export const trainerDecks: Migration = {
  version: 43,
  name: "trainer_decks",
  statements: [
    `CREATE TABLE IF NOT EXISTS trainer_srs (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       deck TEXT NOT NULL,
       card_id TEXT NOT NULL,
       state TEXT NOT NULL CHECK (state IN ('new','learning','review','relearning')),
       ease REAL NOT NULL DEFAULT 2.5,
       interval_days INTEGER NOT NULL DEFAULT 0,
       due_date TEXT NOT NULL,
       reps INTEGER NOT NULL DEFAULT 0,
       lapses INTEGER NOT NULL DEFAULT 0,
       last_reviewed_at TEXT,
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, deck, card_id)
     )`,
    "CREATE INDEX IF NOT EXISTS idx_trainer_srs_due ON trainer_srs(user_id, deck, due_date)",
    `CREATE TABLE IF NOT EXISTS trainer_reviews (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       deck TEXT NOT NULL,
       client_id TEXT NOT NULL,
       card_id TEXT NOT NULL,
       grade TEXT NOT NULL CHECK (grade IN ('again','hard','good','easy')),
       prev_state TEXT NOT NULL CHECK (prev_state IN ('new','learning','review','relearning')),
       source TEXT NOT NULL CHECK (source IN ('trainer','drill')),
       applied INTEGER NOT NULL DEFAULT 1,
       outcome_json TEXT NOT NULL DEFAULT '{}',
       reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
       local_date TEXT NOT NULL,
       duration_ms INTEGER
     )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_reviews_client ON trainer_reviews(user_id, deck, client_id)",
    "CREATE INDEX IF NOT EXISTS idx_trainer_reviews_user_date ON trainer_reviews(user_id, deck, local_date)",
    `CREATE TABLE IF NOT EXISTS trainer_settings (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       deck TEXT NOT NULL,
       settings_json TEXT NOT NULL DEFAULT '{}',
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, deck)
     )`,
  ],
};
