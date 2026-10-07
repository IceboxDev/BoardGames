// Migration 0050 — Quiztopia content reports.
//
// A member flags a problem with a question or an article (a wrong answer, a
// typo, a bad translation, a wrong timeline date, …); an admin reviews and
// resolves it. `snapshot_json` keeps the content as the reporter saw it —
// built by the server from the content store — so the review shows whether
// the content has changed since. One OPEN report per member, target and
// issue (the partial unique index): reporting the same thing again updates
// it. A resolution stays unread for the reporter until `reporter_seen_at`.
// Reports are about content, not progress: a progress reset keeps them.

import type { Migration } from "./types.ts";

export const quiztopiaReports: Migration = {
  version: 50,
  name: "quiztopia_reports",
  statements: [
    `CREATE TABLE IF NOT EXISTS quiztopia_reports (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       target_kind TEXT NOT NULL CHECK (target_kind IN ('question','article')),
       target_id TEXT NOT NULL,
       set_id TEXT NOT NULL,
       category INTEGER NOT NULL CHECK (category BETWEEN 1 AND 12),
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
    "CREATE INDEX IF NOT EXISTS idx_quiztopia_reports_status ON quiztopia_reports(status, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_quiztopia_reports_user ON quiztopia_reports(user_id, created_at)",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_quiztopia_reports_open
       ON quiztopia_reports(user_id, target_id, issue) WHERE status = 'open'`,
  ],
};
