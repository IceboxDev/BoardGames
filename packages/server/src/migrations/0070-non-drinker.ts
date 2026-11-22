// Migration 0070 — non-drinkers.
//
// An admin-set flag on a member: while anyone coming to a still-voting night
// is a non-drinker, its picker leaves out the drinking games (catalog
// `drinking: true`). A better-auth additional field like `onlineMode`, so it
// rides along in the admin user list.

import type { Migration } from "./types.ts";

export const nonDrinker: Migration = {
  version: 70,
  name: "non_drinker",
  statements: [`ALTER TABLE "user" ADD COLUMN "nonDrinker" INTEGER NOT NULL DEFAULT 0`],
};
