// Migration 0044 — drop the server-run AI tournament game logs.
//
// Tournaments no longer run on the server: they are played locally with
// `pnpm --filter @boardgames/core tournament <slug>` and their results ship as
// data in the web bundle. `tournament_games` held the per-game logs of one
// Lost Cities run of three games (checked in dev and production on
// 2026-09-27), so nothing of value is lost.
//
// It goes first, in its own migration: it holds the ON DELETE CASCADE
// reference to `tournaments`, which 0045 then drops with no referrer left
// (see drop-table-safety.test.ts). Its index goes with it.

import type { Migration } from "./types.ts";

export const dropTournamentGames: Migration = {
  version: 44,
  name: "drop_tournament_games",
  statements: ["DROP TABLE IF EXISTS tournament_games"],
};
