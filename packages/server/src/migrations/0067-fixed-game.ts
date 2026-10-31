// Migration 0067 — a locked night can have its game set in advance.
//
// A campaign's next session is locked straight from the campaign night
// ("Find the next session"): the night IS that game, so there is nothing to
// vote on. `fixed_game_slug` holds the game; while it is set the night's
// lineup is that one game, it counts as sealed from lock-in, and reactions
// are refused. NULL — every existing row — keeps the vote. Schema-only.

import type { Migration } from "./types.ts";

export const fixedGame: Migration = {
  version: 67,
  name: "fixed_game",
  statements: ["ALTER TABLE locked_dates ADD COLUMN fixed_game_slug TEXT"],
};
