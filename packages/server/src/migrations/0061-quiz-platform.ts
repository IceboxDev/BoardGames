// Migration 0061 — the quiz platform replaces the Quiztopia trainer.
//
// The trainer now studies FACTS of a multi-game quiz bank (`core/quiz/`):
// schedule and review log move onto the generic deck tables (deck 'quiz',
// card id = fact id), reads are kept per article, and reports lose their
// stored set/category (the content says where a target lives). Progress is
// carried across by formula — the bank's first import gave every legacy
// question `cNNN-sNN-qN` the fact `f` + ((c−1)·60 + (n−1)·5 + q + 1) and
// every set `cNNN-sNN` the article `a` + ((c−1)·12 + n) (`quiz/ids.ts`,
// pinned by its test). Only the trainer's language survives from the old
// settings; the budget model changed.
//
// `trainer_reviews.source` gains 'game' (table-game answers recorded by the
// server): SQLite can't alter a CHECK in place, so it is the standard
// rebuild. Nothing references trainer_reviews or the dropped quiztopia_*
// tables, so no DROP cascades (`drop-table-safety.test.ts`).

import type { Migration } from "./types.ts";

const fact = (col: string) =>
  `printf('f%05d', (CAST(substr(${col}, 2, 3) AS INTEGER) - 1) * 60 + (CAST(substr(${col}, 7, 2) AS INTEGER) - 1) * 5 + CAST(substr(${col}, 11, 1) AS INTEGER) + 1)`;
const article = (col: string) =>
  `printf('a%04d', (CAST(substr(${col}, 2, 3) AS INTEGER) - 1) * 12 + CAST(substr(${col}, 7, 2) AS INTEGER))`;

export const quizPlatform: Migration = {
  version: 61,
  name: "quiz_platform",
  statements: [
    // ── trainer_reviews: source gains 'game' ──
    `CREATE TABLE trainer_reviews_new (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       deck TEXT NOT NULL,
       client_id TEXT NOT NULL,
       card_id TEXT NOT NULL,
       grade TEXT NOT NULL CHECK (grade IN ('again','hard','good','easy')),
       prev_state TEXT NOT NULL CHECK (prev_state IN ('new','learning','review','relearning')),
       source TEXT NOT NULL CHECK (source IN ('trainer','drill','game')),
       applied INTEGER NOT NULL DEFAULT 1,
       outcome_json TEXT NOT NULL DEFAULT '{}',
       reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
       local_date TEXT NOT NULL,
       duration_ms INTEGER
     )`,
    `INSERT INTO trainer_reviews_new
       (id, user_id, deck, client_id, card_id, grade, prev_state, source, applied, outcome_json,
        reviewed_at, local_date, duration_ms)
     SELECT id, user_id, deck, client_id, card_id, grade, prev_state, source, applied, outcome_json,
            reviewed_at, local_date, duration_ms
       FROM trainer_reviews`,
    "DROP TABLE trainer_reviews",
    "ALTER TABLE trainer_reviews_new RENAME TO trainer_reviews",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_reviews_client ON trainer_reviews(user_id, deck, client_id)",
    "CREATE INDEX IF NOT EXISTS idx_trainer_reviews_user_date ON trainer_reviews(user_id, deck, local_date)",
    "CREATE INDEX IF NOT EXISTS idx_trainer_reviews_user_card ON trainer_reviews(user_id, deck, card_id, id)",

    // ── progress: Quiztopia questions → quiz facts ──
    `INSERT INTO trainer_srs
       (user_id, deck, card_id, state, ease, interval_days, due_date, reps, lapses,
        last_reviewed_at, updated_at)
     SELECT user_id, 'quiz', ${fact("question_id")}, state, ease, interval_days, due_date, reps,
            lapses, last_reviewed_at, updated_at
       FROM quiztopia_srs`,
    `INSERT INTO trainer_reviews
       (user_id, deck, client_id, card_id, grade, prev_state, source, applied, outcome_json,
        reviewed_at, local_date, duration_ms)
     SELECT user_id, 'quiz', client_id, ${fact("question_id")}, grade, prev_state, source, applied,
            CASE WHEN room_code IS NULL THEN '{}' ELSE json_object('roomCode', room_code) END,
            reviewed_at, local_date, duration_ms
       FROM quiztopia_reviews ORDER BY id`,
    `INSERT INTO trainer_settings (user_id, deck, settings_json, updated_at)
     SELECT user_id, 'quiz', json_object('language', language), updated_at
       FROM quiztopia_settings`,

    // ── article reads ──
    `CREATE TABLE IF NOT EXISTS quiz_wiki_reads (
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       article_id TEXT NOT NULL,
       read_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, article_id)
     )`,
    `INSERT INTO quiz_wiki_reads (user_id, article_id, read_at)
     SELECT user_id, ${article("set_id")}, read_at FROM quiztopia_wiki_reads`,
    `CREATE TABLE IF NOT EXISTS quiz_wiki_read_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       article_id TEXT NOT NULL,
       read_at TEXT NOT NULL
     )`,
    "CREATE INDEX IF NOT EXISTS idx_quiz_wiki_read_log_user_time ON quiz_wiki_read_log(user_id, read_at)",
    `INSERT INTO quiz_wiki_read_log (user_id, article_id, read_at)
     SELECT user_id, ${article("set_id")}, read_at FROM quiztopia_wiki_read_log ORDER BY id`,

    // ── reports ──
    `CREATE TABLE IF NOT EXISTS quiz_reports (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       target_kind TEXT NOT NULL CHECK (target_kind IN ('question','article')),
       target_id TEXT NOT NULL,
       issue TEXT NOT NULL CHECK (issue IN ('wrong-answer','unclear-question','typo','translation','wrong-date','bad-source','factual-error','wrong-highlight','other')),
       language TEXT NOT NULL CHECK (language IN ('en','de','both')),
       message TEXT CHECK (message IS NULL OR length(message) <= 1000),
       surface TEXT NOT NULL CHECK (surface IN ('trainer','wiki','journal','timeline','game')),
       content_version TEXT NOT NULL,
       snapshot_json TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixed','declined')),
       resolution_note TEXT,
       resolved_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       resolved_at TEXT,
       reporter_seen_at TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    "CREATE INDEX IF NOT EXISTS idx_quiz_reports_status ON quiz_reports(status, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_quiz_reports_user ON quiz_reports(user_id, created_at)",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_reports_open
       ON quiz_reports(user_id, target_id, issue) WHERE status = 'open'`,
    `INSERT INTO quiz_reports
       (id, user_id, target_kind, target_id, issue, language, message, surface, content_version,
        snapshot_json, status, resolution_note, resolved_by, resolved_at, reporter_seen_at,
        created_at, updated_at)
     SELECT id, user_id, target_kind,
            CASE target_kind WHEN 'question' THEN ${fact("target_id")} ELSE ${article("target_id")} END,
            issue, language, message, surface, content_version, snapshot_json, status,
            resolution_note, resolved_by, resolved_at, reporter_seen_at, created_at, updated_at
       FROM quiztopia_reports`,

    // ── the Quiztopia-only tables go ──
    "DROP TABLE quiztopia_srs",
    "DROP TABLE quiztopia_reviews",
    "DROP TABLE quiztopia_settings",
    "DROP TABLE quiztopia_wiki_reads",
    "DROP TABLE quiztopia_wiki_read_log",
    "DROP TABLE quiztopia_reports",
  ],
};
