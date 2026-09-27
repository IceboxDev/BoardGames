// Migration 0045 — drop the server-run AI tournament table (see 0044).

import type { Migration } from "./types.ts";

/** Baseline tables later migrations removed — the chain test expects them gone. */
export const RETIRED_TOURNAMENT_TABLES = ["tournament_games", "tournaments"] as const;

export const dropTournaments: Migration = {
  version: 45,
  name: "drop_tournaments",
  statements: ["DROP TABLE IF EXISTS tournaments"],
};
