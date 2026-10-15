// Migration 0056 — the chess analysis farm.
//
// `chess_position_evals`: one deep evaluation per (position, spec, kind),
// shared by every member's opening trees (`PositionEvalSchema` in
// core/protocol/http/chess-farm.ts as `result_json`). `chess_eval_jobs`: the
// queue a farm worker (ws21) claims from — one row per position still to
// analyse, highest reach first, leased while running. `chess_farm_workers`:
// when each worker last checked in.

import type { Migration } from "./types.ts";

export const chessFarm: Migration = {
  version: 56,
  name: "chess_farm",
  statements: [
    `CREATE TABLE IF NOT EXISTS chess_position_evals (
       fen_key TEXT NOT NULL,
       spec TEXT NOT NULL,
       kind TEXT NOT NULL CHECK (kind IN ('user', 'opp')),
       best TEXT NOT NULL,
       depth INTEGER NOT NULL,
       source TEXT NOT NULL,
       engine TEXT NOT NULL,
       result_json TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (fen_key, spec, kind)
     )`,
    `CREATE TABLE IF NOT EXISTS chess_eval_jobs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       fen_key TEXT NOT NULL,
       spec TEXT NOT NULL,
       kind TEXT NOT NULL CHECK (kind IN ('user', 'opp')),
       fen TEXT NOT NULL,
       reach INTEGER NOT NULL DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
       worker TEXT,
       claimed_at_ms INTEGER,
       attempts INTEGER NOT NULL DEFAULT 0,
       seconds REAL,
       error TEXT,
       requested_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       UNIQUE (fen_key, spec, kind)
     )`,
    "CREATE INDEX IF NOT EXISTS chess_eval_jobs_queue ON chess_eval_jobs(status, reach DESC, id)",
    `CREATE TABLE IF NOT EXISTS chess_farm_workers (
       worker TEXT PRIMARY KEY,
       last_seen_ms INTEGER NOT NULL
     )`,
  ],
};
