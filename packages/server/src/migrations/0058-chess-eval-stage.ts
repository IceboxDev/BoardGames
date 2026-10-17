// Migration 0058 — where a queued farm position sits in a line's extension.
//
// `chess_eval_jobs.stage`: 0 for a position on one of your games' lines; 1–3
// for the short extension past a line end where your games left the tree
// (1 the opponent after your correct move, 2 your answers, 3 the opponent
// after those — nothing below). The farm's follow-ups read it to know how far
// the extension has gone (`scripts/chess-farm/follow-ups.ts`).

import type { Migration } from "./types.ts";

export const chessEvalStage: Migration = {
  version: 58,
  name: "chess_eval_stage",
  statements: ["ALTER TABLE chess_eval_jobs ADD COLUMN stage INTEGER NOT NULL DEFAULT 0"],
};
