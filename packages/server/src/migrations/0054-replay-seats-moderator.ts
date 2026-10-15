// Migration 0054 — `replay_seats.result` gains 'moderator'.
//
// A Blood on the Clocktower Storyteller sits at the online table (seat 0) but
// neither wins nor loses: the machine outcome names them in
// `TeamsOutcome.moderatorSeats` and `seatResult` reports "moderator". The
// column's CHECK only allowed win/loss/draw, and SQLite can't alter a CHECK in
// place, so this is the standard rebuild. Nothing references replay_seats (it
// only references session_replays), so the DROP can't cascade anywhere —
// `drop-table-safety.test.ts` re-checks that. The column list is 0046's, and
// the index dropped with the old table is recreated.

import type { Migration } from "./types.ts";

export const replaySeatsModerator: Migration = {
  version: 54,
  name: "replay_seats_moderator",
  statements: [
    `CREATE TABLE replay_seats_new (
       replay_id INTEGER NOT NULL REFERENCES session_replays(id) ON DELETE CASCADE,
       seat INTEGER NOT NULL CHECK (seat >= 0),
       kind TEXT NOT NULL CHECK (kind IN ('human','ai')),
       user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       strategy TEXT,
       result TEXT NOT NULL CHECK (result IN ('win','loss','draw','moderator')),
       placement INTEGER CHECK (placement IS NULL OR placement >= 1),
       score REAL,
       PRIMARY KEY (replay_id, seat)
     )`,
    `INSERT INTO replay_seats_new
       (replay_id, seat, kind, user_id, strategy, result, placement, score)
     SELECT replay_id, seat, kind, user_id, strategy, result, placement, score
     FROM replay_seats`,
    "DROP TABLE replay_seats",
    "ALTER TABLE replay_seats_new RENAME TO replay_seats",
    "CREATE INDEX IF NOT EXISTS idx_replay_seats_user ON replay_seats(user_id, replay_id)",
  ],
};
