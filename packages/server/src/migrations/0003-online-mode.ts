// Migration 0003 — three-state online mode.
//
// Replaces the binary `user.onlineEnabled` (integer 0/1) with a string enum
// `onlineMode` ∈ {'online','offline','both'}. The legacy column stays in
// place so already-issued sessions and any read paths still in flight during
// deploy don't break — it's no longer written by application code and a
// future migration may drop it.
//
// Mapping (one-way; this is the canonical backfill for production data):
//   onlineEnabled = 1            → onlineMode = 'both'    (preserves online
//                                                          access, still allows
//                                                          in-person events)
//   onlineEnabled = 0 or NULL    → onlineMode = 'offline' (default)
//
// `pending_inventory` also grows an `online_mode` column so the admin's
// pre-register queue can pre-set the new user's mode at signup. Existing
// (pre-migration) rows backfill to 'offline' via the column default.
//
// All statements run as ONE atomic libsql batch with the bookkeeping row, so
// the backfill cannot drift from the schema change — every row in
// `user` has a correct `onlineMode` value the instant the column exists.

import type { Migration } from "./types.ts";

export const onlineMode: Migration = {
  version: 3,
  name: "online_mode",
  statements: [
    `ALTER TABLE "user" ADD COLUMN "onlineMode" TEXT NOT NULL DEFAULT 'offline'`,
    `UPDATE "user" SET "onlineMode" = 'both' WHERE "onlineEnabled" = 1`,
    `ALTER TABLE pending_inventory ADD COLUMN online_mode TEXT NOT NULL DEFAULT 'offline'`,
  ],
};
