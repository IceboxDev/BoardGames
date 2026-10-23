// Migration 0062 — quiz reports may be about the Russian text.
//
// The quiz bank gained Russian as a third language, so a member can report a
// problem in the Russian wording or article (`language = 'ru'`). SQLite can't
// alter a CHECK in place, so it is the standard rebuild of 0061's table;
// nothing references quiz_reports, so the DROP cascades nowhere
// (`drop-table-safety.test.ts`). The indexes dropped with the old table are
// recreated.

import type { Migration } from "./types.ts";

export const quizReportsRussian: Migration = {
  version: 62,
  name: "quiz_reports_russian",
  statements: [
    `CREATE TABLE quiz_reports_new (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       target_kind TEXT NOT NULL CHECK (target_kind IN ('question','article')),
       target_id TEXT NOT NULL,
       issue TEXT NOT NULL CHECK (issue IN ('wrong-answer','unclear-question','typo','translation','wrong-date','bad-source','factual-error','wrong-highlight','other')),
       language TEXT NOT NULL CHECK (language IN ('en','de','ru','both')),
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
    `INSERT INTO quiz_reports_new
       (id, user_id, target_kind, target_id, issue, language, message, surface, content_version,
        snapshot_json, status, resolution_note, resolved_by, resolved_at, reporter_seen_at,
        created_at, updated_at)
     SELECT id, user_id, target_kind, target_id, issue, language, message, surface, content_version,
            snapshot_json, status, resolution_note, resolved_by, resolved_at, reporter_seen_at,
            created_at, updated_at
       FROM quiz_reports`,
    "DROP TABLE quiz_reports",
    "ALTER TABLE quiz_reports_new RENAME TO quiz_reports",
    "CREATE INDEX IF NOT EXISTS idx_quiz_reports_status ON quiz_reports(status, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_quiz_reports_user ON quiz_reports(user_id, created_at)",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_reports_open
       ON quiz_reports(user_id, target_id, issue) WHERE status = 'open'`,
  ],
};
