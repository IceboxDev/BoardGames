// Migration 0065 — a quiz report can point at what fixed it.
//
// The quiz bank's backlog (`content/backlog.jsonl`) and changelog
// (`content/history/`) live in the repo, so the link from a member report to
// the backlog item that tracks it (`b00012`) and the history entry that fixed
// it (`a0042#17`) is stored on the report: two nullable columns, set by the
// admin when resolving (or later from the quiz desk). Schema-only.

import type { Migration } from "./types.ts";

export const quizReportLinks: Migration = {
  version: 65,
  name: "quiz_report_links",
  statements: [
    "ALTER TABLE quiz_reports ADD COLUMN backlog_id TEXT",
    "ALTER TABLE quiz_reports ADD COLUMN history_ref TEXT",
  ],
};
