// Migration 0064 — the lichess opening explorer's answers, kept and shared.
//
// `chess_explorer_cache`: per position (its position key) the explorer's move
// list (every rating and speed: the moves with their white / draw / black
// counts) and the position's game count. The trainer builds opponent replies
// from it and sizes the map's folders by it; lichess allows only about one
// request every three seconds, so each position is fetched once — by a
// member's browser or by the analysis farm's server — and then read from
// here by everyone. The numbers barely move, so an answer stays good for
// months (`lib/chess-trainer/explorer-cache.ts`).

import type { Migration } from "./types.ts";

export const chessExplorerCache: Migration = {
  version: 64,
  name: "chess_explorer_cache",
  statements: [
    `CREATE TABLE IF NOT EXISTS chess_explorer_cache (
       fen_key TEXT PRIMARY KEY,
       games INTEGER NOT NULL,
       moves_json TEXT NOT NULL,
       fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  ],
};
