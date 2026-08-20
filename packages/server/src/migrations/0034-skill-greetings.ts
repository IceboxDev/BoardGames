// Migration 0034 — greetings + an explicit recompute baseline.
//
// Recompute is no longer a side effect of recording a match: an admin runs it
// when a game night is finished, and the run diffs the ratings against the
// previous ones to find who moved. That needs two things the 0033 schema
// can't express.
//
// 1. A BASELINE. The state row is a singleton overwritten in place, so the
//    "before" picture used to be lost the moment a recompute wrote. The
//    `prev_*` columns keep the payload the current one replaced, along with
//    the config version it was fitted under — a diff across an engine change
//    would attribute the new maths to a player, so comparability is checked,
//    not assumed. `engine_fingerprint` splits config+catalog drift (which
//    still self-heals on boot) away from match-history drift (which now waits
//    for the admin).
//
// 2. GREETINGS. One row per published pop-up. Append-only and never mutated
//    except to retract, so the group's celebration history stays readable.
//    `user_profiles.greeting_seen_id` is the high-water mark of what a member
//    has dismissed: a newer greeting outranks an unseen older one, which is
//    what makes a spotlight supersede rather than queue up behind one someone
//    was away too long to see.

import type { Migration } from "./types.ts";

export const skillGreetings: Migration = {
  version: 34,
  name: "skill_greetings",
  statements: [
    `CREATE TABLE skill_greetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      subject_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      retracted_at TEXT
    )`,
    "ALTER TABLE user_profiles ADD COLUMN greeting_seen_id INTEGER",
    "ALTER TABLE skill_rating_state ADD COLUMN engine_fingerprint TEXT",
    "ALTER TABLE skill_rating_state ADD COLUMN prev_payload_json TEXT",
    "ALTER TABLE skill_rating_state ADD COLUMN prev_computed_at TEXT",
    "ALTER TABLE skill_rating_state ADD COLUMN prev_config_version INTEGER",
  ],
};
