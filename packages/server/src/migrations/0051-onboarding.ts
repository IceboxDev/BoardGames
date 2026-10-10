// Migration 0051 — onboarding state per member.
//
// One row per member: whether the welcome tour was finished or skipped (and
// how far they got), and which first-use hints they've dismissed, as one
// JSON value (`OnboardingStateSchema` in core/protocol/http/onboarding.ts).
// Only accounts created from now on get the tour and the hints: every
// existing member is backfilled as `existingMember`. A member without a
// row is a new member.

import type { Migration } from "./types.ts";

export const onboarding: Migration = {
  version: 51,
  name: "onboarding",
  statements: [
    `CREATE TABLE IF NOT EXISTS user_onboarding (
       user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
       state_json TEXT NOT NULL,
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `INSERT INTO user_onboarding (user_id, state_json)
       SELECT id, '{"existingMember":true,"hints":{}}' FROM "user" WHERE 1
       ON CONFLICT(user_id) DO NOTHING`,
  ],
};
