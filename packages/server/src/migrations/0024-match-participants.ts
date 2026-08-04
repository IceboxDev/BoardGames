// Migration 0024 — `match_participants`, a materialized index of who played.
//
// Every per-user history read (profile stats, profile match list) used to be
// `outcome_json LIKE '%"userId":"<id>"%'`. A leading-wildcard LIKE is
// unindexable, so each profile view full-scanned `match_results` — with no
// LIMIT on the stats query. This table turns that scan into an index seek.
//
// It stores ONLY `(match_id, user_id)`. Deliberately no denormalized
// result/credit column: `deriveParticipantResult` and
// `participantPerformanceCredit` (core/history/participant-results.ts) depend
// on the whole outcome AND on the game's scoring direction
// (`lowScoreWinsForSlug`), so a SQL copy of them would drift from the JS the
// moment either rule changes. Membership is the only fact that is cheap and
// stable enough to materialize; win/loss stays derived from `outcome_json` in
// JS. `extractParticipantIds` remains the single definition of "who is in a
// match" — this table is its index, not a competing source of truth.
//
// The backfill mirrors `extractParticipantIds` path-for-path across all five
// outcome kinds:
//   free-for-all / last-standing  $.players[*].userId
//   teams                         $.teams[*].members[*].userId, $.moderator.userId
//   coop                          $.participants[*].userId,     $.moderator.userId
//   one-vs-many                   $.solo.userId, $.team.members[*].userId
//
// `user_id` is FK'd to `user`, but `outcome_json` never was, so a deleted
// account can still be named by an old outcome. Those ids are skipped rather
// than inserted (an unfiltered insert would abort the whole migration on an FK
// violation) — which is also exactly what ON DELETE CASCADE would do to them a
// moment later. Verified against a prod snapshot via `migrate:dry-run`: the
// backfill reproduces `extractParticipantIds` for every row, with no dangling
// ids to skip.

import type { Migration } from "./types.ts";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS match_participants (
  match_id INTEGER NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY (match_id, user_id)
)`;

// The whole point: "every match this user played", answered by a seek. The PK
// already covers the match_id direction (cascade deletes, per-match rewrites).
const CREATE_INDEX = `CREATE INDEX IF NOT EXISTS idx_match_participants_user
  ON match_participants(user_id, match_id)`;

/** `id IN (SELECT id FROM "user")` as a correlated guard on a JSON-extracted id. */
const EXISTING_USER = `EXISTS (SELECT 1 FROM "user" u WHERE u.id = participant_id)`;

const BACKFILL_PLAYERS = `INSERT OR IGNORE INTO match_participants (match_id, user_id)
  SELECT match_id, participant_id FROM (
    SELECT m.id AS match_id, json_extract(p.value, '$.userId') AS participant_id
      FROM match_results m, json_each(m.outcome_json, '$.players') p
     WHERE json_extract(m.outcome_json, '$.kind') IN ('free-for-all', 'last-standing')
  ) WHERE participant_id IS NOT NULL AND ${EXISTING_USER}`;

const BACKFILL_TEAM_MEMBERS = `INSERT OR IGNORE INTO match_participants (match_id, user_id)
  SELECT match_id, participant_id FROM (
    SELECT m.id AS match_id, json_extract(mem.value, '$.userId') AS participant_id
      FROM match_results m,
           json_each(m.outcome_json, '$.teams') t,
           json_each(t.value, '$.members') mem
     WHERE json_extract(m.outcome_json, '$.kind') = 'teams'
  ) WHERE participant_id IS NOT NULL AND ${EXISTING_USER}`;

const BACKFILL_COOP_PARTICIPANTS = `INSERT OR IGNORE INTO match_participants (match_id, user_id)
  SELECT match_id, participant_id FROM (
    SELECT m.id AS match_id, json_extract(p.value, '$.userId') AS participant_id
      FROM match_results m, json_each(m.outcome_json, '$.participants') p
     WHERE json_extract(m.outcome_json, '$.kind') = 'coop'
  ) WHERE participant_id IS NOT NULL AND ${EXISTING_USER}`;

// Both `teams` and `coop` carry the same optional non-competing slot
// (Clocktower Storyteller / D&D Dungeon Master) and both count as present.
const BACKFILL_MODERATORS = `INSERT OR IGNORE INTO match_participants (match_id, user_id)
  SELECT match_id, participant_id FROM (
    SELECT m.id AS match_id, json_extract(m.outcome_json, '$.moderator.userId') AS participant_id
      FROM match_results m
     WHERE json_extract(m.outcome_json, '$.kind') IN ('teams', 'coop')
  ) WHERE participant_id IS NOT NULL AND ${EXISTING_USER}`;

const BACKFILL_SOLO = `INSERT OR IGNORE INTO match_participants (match_id, user_id)
  SELECT match_id, participant_id FROM (
    SELECT m.id AS match_id, json_extract(m.outcome_json, '$.solo.userId') AS participant_id
      FROM match_results m
     WHERE json_extract(m.outcome_json, '$.kind') = 'one-vs-many'
  ) WHERE participant_id IS NOT NULL AND ${EXISTING_USER}`;

const BACKFILL_MANY = `INSERT OR IGNORE INTO match_participants (match_id, user_id)
  SELECT match_id, participant_id FROM (
    SELECT m.id AS match_id, json_extract(mem.value, '$.userId') AS participant_id
      FROM match_results m, json_each(m.outcome_json, '$.team.members') mem
     WHERE json_extract(m.outcome_json, '$.kind') = 'one-vs-many'
  ) WHERE participant_id IS NOT NULL AND ${EXISTING_USER}`;

export const matchParticipants: Migration = {
  version: 24,
  name: "match_participants",
  statements: [
    CREATE_TABLE,
    CREATE_INDEX,
    BACKFILL_PLAYERS,
    BACKFILL_TEAM_MEMBERS,
    BACKFILL_COOP_PARTICIPANTS,
    BACKFILL_MODERATORS,
    BACKFILL_SOLO,
    BACKFILL_MANY,
  ],
};
