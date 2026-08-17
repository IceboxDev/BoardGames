// Migration 0033 — skill-rating state.
//
// The six-trait rating fit is a pure function of (match history, catalog
// weights, config version), recomputed in full on every history mutation —
// so persistence is one global blob (the whole club's result is a few KB)
// plus a fingerprint of the inputs for staleness detection. Per-row rating
// tables would only add ways for derived state to drift.
//
// `skill_intro_seen_at` on user_profiles records the one-time "skill
// profiles are live" welcome-card acknowledgement.

import type { Migration } from "./types.ts";

export const skillRatings: Migration = {
  version: 33,
  name: "skill_ratings",
  statements: [
    `CREATE TABLE skill_rating_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload_json TEXT NOT NULL,
      input_fingerprint TEXT NOT NULL,
      config_version INTEGER NOT NULL,
      computed_at TEXT NOT NULL
    )`,
    "ALTER TABLE user_profiles ADD COLUMN skill_intro_seen_at TEXT",
  ],
};
