// Migration 0026 — per-member device/viewport telemetry.
//
// One row per (user, device signature): device class, screen resolution,
// devicePixelRatio, viewport bucket, browser + OS. Reported by the web client
// on load and on significant viewport changes, upserted here so the admin
// activity drawer can show "which setups does this member browse on" — the
// missing piece for reproducing their layout issues locally. The full most-
// recent payload lives in device_json; the signature only buckets identity.
//
// ON DELETE CASCADE like activity_log: telemetry dies with the account.

import type { Migration } from "./types.ts";

export const userDevices: Migration = {
  version: 26,
  name: "user_devices",
  statements: [
    `CREATE TABLE IF NOT EXISTS user_devices (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       signature TEXT NOT NULL,
       device_json TEXT NOT NULL,
       first_seen TEXT NOT NULL DEFAULT (datetime('now')),
       last_seen TEXT NOT NULL DEFAULT (datetime('now')),
       hits INTEGER NOT NULL DEFAULT 1,
       UNIQUE (user_id, signature)
     )`,
  ],
};
