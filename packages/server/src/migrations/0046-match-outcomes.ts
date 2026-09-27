// Migration 0046 — online matches record how they ended and who played.
//
// `session_replays` was shaped for two-player games: `score_p0`/`score_p1`, a
// free-text `winner` ("p0", a team number, a co-op result, or — for Durak —
// the loser), and no record of which account sat where. Match history had to
// guess, and got Durak and Pandemic wrong.
//
//   • `outcome_json` — the shared `GameOutcome` (ranked / coop / teams).
//   • `seed`         — the START seed; with the log it reproduces the game.
//   • `replay_seats` — one row per seat: who (account or AI strategy), and the
//                      seat's result, place and score, so "my games" and
//                      per-player stats are an index seek.
//
// The legacy columns stay for rows written before this; the read path derives
// an outcome from them when `outcome_json` is NULL (matches/legacy-outcome.ts).
// New rows leave them NULL. Purely additive.

import type { Migration } from "./types.ts";

export const matchOutcomes: Migration = {
  version: 46,
  name: "match_outcomes",
  statements: [
    "ALTER TABLE session_replays ADD COLUMN outcome_json TEXT",
    "ALTER TABLE session_replays ADD COLUMN seed INTEGER",
    `CREATE TABLE IF NOT EXISTS replay_seats (
       replay_id INTEGER NOT NULL REFERENCES session_replays(id) ON DELETE CASCADE,
       seat INTEGER NOT NULL CHECK (seat >= 0),
       kind TEXT NOT NULL CHECK (kind IN ('human','ai')),
       user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       strategy TEXT,
       result TEXT NOT NULL CHECK (result IN ('win','loss','draw')),
       placement INTEGER CHECK (placement IS NULL OR placement >= 1),
       score REAL,
       PRIMARY KEY (replay_id, seat)
     )`,
    "CREATE INDEX IF NOT EXISTS idx_replay_seats_user ON replay_seats(user_id, replay_id)",
  ],
};
