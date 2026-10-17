// Migration 0059 — the headcount a game vote was cast at.
//
// `game_requests.headcount`: how many players the night had to fit when the
// vote went in (the low end of the player window — confirmed players on an
// open night, the seat count on a private one). Admins see a person's votes
// as outdated once the headcount has moved on. NULL for votes cast before
// this column existed: their headcount is unknown, so they are never flagged.

import type { Migration } from "./types.ts";

export const gameRequestHeadcount: Migration = {
  version: 59,
  name: "game_request_headcount",
  statements: ["ALTER TABLE game_requests ADD COLUMN headcount INTEGER"],
};
