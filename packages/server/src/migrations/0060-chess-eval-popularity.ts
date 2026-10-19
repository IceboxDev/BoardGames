// Migration 0060 — how popular a farm job's position is on lichess.
//
// `chess_eval_jobs.popularity`: the lichess opening explorer's game count at
// the position (every rating and speed), filled in the background by the farm
// server that has a lichess token (`lib/chess-trainer/farm-popularity.ts`).
// The farm claims the most played positions first; NULL (not looked up yet)
// waits behind every counted one.

import type { Migration } from "./types.ts";

export const chessEvalPopularity: Migration = {
  version: 60,
  name: "chess_eval_popularity",
  statements: [
    "ALTER TABLE chess_eval_jobs ADD COLUMN popularity INTEGER",
    "CREATE INDEX IF NOT EXISTS chess_eval_jobs_popularity ON chess_eval_jobs(status, popularity)",
  ],
};
