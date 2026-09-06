import { replaceParticipant } from "@boardgames/core/history/participant-rewrite";
import {
  MatchOutcomeSchema,
  MergeGuestBodySchema,
  MergeGuestResponseSchema,
} from "@boardgames/core/protocol";
import type { InStatement } from "@libsql/client";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { matchIdOf, participantSyncStatements } from "../lib/match-participants.ts";

export const adminMergeGuestRoutes = adminApp();

const UserFlagsRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  guest: z.union([z.number(), z.boolean()]).nullable(),
});

const MatchOutcomeRowSchema = z.object({
  id: z.number(),
  outcome_json: z.string(),
});

// ── POST /api/admin/users/merge-guest ─────────────────────────────────
//
// Fold a guest stub into a real account. A guest is a stub row, but it is
// NOT confined to match outcomes: `POST /night-guest` (calendar-locks.ts)
// gives a guest a real `rsvps` row and writes the guest id into the night's
// sealed guest list, and "nights attended" is credited from exactly those
// RSVPs when a night has no recorded match. Deleting the guest with FK
// cascades on would therefore erase attendance history the merged member
// earned. So the merge is, in ONE atomic batch:
//
//   1. every match outcome naming the guest is rewritten to the target (a
//      compare-and-set against the JSON we read, so a concurrent edit is
//      never overwritten) and its participant index resynced under the same
//      guard;
//   2. every user-keyed row a guest can hold is re-pointed at the target —
//      RSVPs, game reactions, EXIT votes, availability, poll votes, hosted
//      nights, spotlight subject — with the target's own explicit answer
//      winning on conflict;
//   3. the guest id is substituted for the target's in every sealed guest
//      list (`expected_user_ids_json` on nights and their tombstones), which
//      have no FK and would otherwise dangle forever;
//   4. the guest row is deleted — but ONLY if nothing in `match_participants`
//      still names it. A match recorded between our read and this batch
//      leaves such a row, the delete is a no-op, and the request reports a
//      conflict so the admin retries against the new history. Every earlier
//      statement is idempotent, so the retry is safe.
//
// Stats need no further work: they are derived from outcomes at read time,
// so they move with the rewrite.

/**
 * Every table with a foreign key onto `user`, classified. `transferred`
 * rows are re-pointed at the target inside the merge batch; `droppedByDesign`
 * rows are things a guest stub can never hold (it has no login, no session,
 * no play area) and are left to ON DELETE CASCADE / SET NULL. The merge test
 * reads the live schema and fails when a new FK is in neither list, so a
 * future table cannot silently join the cascade.
 */
export const GUEST_MERGE_COVERAGE = {
  transferred: [
    "rsvps.user_id",
    "game_requests.user_id",
    "exit_game_votes.user_id",
    "user_availability_days.user_id",
    "purchase_poll_votes.user_id",
    "purchase_poll_seen.user_id",
    "locked_dates.host_user_id",
    "skill_greetings.subject_user_id",
    "match_participants.user_id",
  ],
  droppedByDesign: [
    // better-auth: a guest never signs in.
    "account.userId",
    "session.userId",
    // Per-account state a stub cannot create (no login, no play area).
    "user_inventory.user_id",
    "user_profiles.user_id",
    "activity_log.user_id",
    "user_devices.user_id",
    "collection_items.user_id",
    "storage_boxes.user_id",
    "sleeve_types.user_id",
    "collection_statuses.user_id",
    "ownership_announcements.user_id",
    "ownership_announcements.resolved_by",
    "dnd_campaigns.user_id",
    "dnd_parties.user_id",
    "dnd_files.user_id",
    "dnd_nodes.user_id",
    "dnd_node_templates.user_id",
    "dnd_history.user_id",
    "dnd_combats.user_id",
  ],
} as const;

/** `(date_key, user_id)`-keyed tables whose rows simply move; duplicates keep the target's. */
const MOVE_OR_IGNORE: readonly { table: string; columns: readonly string[] }[] = [
  { table: "game_requests", columns: ["date_key", "game_slug", "reaction", "created_at"] },
  { table: "exit_game_votes", columns: ["date_key", "exit_slug", "created_at"] },
  { table: "user_availability_days", columns: ["date_key", "status", "updated_at"] },
  { table: "purchase_poll_votes", columns: ["poll_id", "slug", "created_at"] },
  { table: "purchase_poll_seen", columns: ["poll_id", "first_seen_at", "result_seen_at"] },
];

/** Statements re-pointing every transferable row from `guestId` to `targetId`. */
function transferStatements(guestId: string, targetId: string): InStatement[] {
  const statements: InStatement[] = [
    // RSVP: the target's explicit answer wins; only an automatic one yields
    // to the guest's explicit one.
    {
      sql: `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto)
            SELECT date_key, ?, status, rsvped_at, auto FROM rsvps WHERE user_id = ?
            ON CONFLICT(date_key, user_id) DO UPDATE SET
              status = excluded.status,
              rsvped_at = excluded.rsvped_at,
              auto = 0
            WHERE rsvps.auto = 1 AND excluded.auto = 0`,
      args: [targetId, guestId],
    },
    ...MOVE_OR_IGNORE.map(({ table, columns }) => ({
      sql: `INSERT OR IGNORE INTO ${table} (user_id, ${columns.join(", ")})
            SELECT ?, ${columns.join(", ")} FROM ${table} WHERE user_id = ?`,
      args: [targetId, guestId],
    })),
    {
      sql: "UPDATE locked_dates SET host_user_id = ? WHERE host_user_id = ?",
      args: [targetId, guestId],
    },
    {
      sql: "UPDATE skill_greetings SET subject_user_id = ? WHERE subject_user_id = ?",
      args: [targetId, guestId],
    },
  ];
  // Sealed guest lists are JSON arrays with no FK. Substitute in place,
  // keeping first-seen order and collapsing a duplicate if the target was
  // already listed. (Ordered aggregate syntax is not accepted by Turso's
  // parser; the ordered subquery form is.)
  for (const table of ["locked_dates", "calendar_unlocked_tombstones"]) {
    statements.push({
      sql: `UPDATE ${table}
               SET expected_user_ids_json = (
                 SELECT json_group_array(v) FROM (
                   SELECT CASE WHEN value = ? THEN ? ELSE value END AS v, MIN(key) AS k
                     FROM json_each(${table}.expected_user_ids_json)
                    GROUP BY v ORDER BY k))
             WHERE EXISTS (SELECT 1 FROM json_each(${table}.expected_user_ids_json)
                            WHERE value = ?)`,
      args: [guestId, targetId, guestId],
    });
  }
  return statements;
}

adminMergeGuestRoutes.post("/merge-guest", zJsonBody(MergeGuestBodySchema), async (c) => {
  const admin = c.get("user");
  const { guestUserId, targetUserId } = c.req.valid("json");
  if (guestUserId === targetUserId) {
    return errorResponse(c, 400, "cannot merge a user into themselves");
  }

  const db = getDb();
  const { rows: userRows } = await db.execute({
    sql: `SELECT id, name, guest FROM "user" WHERE id IN (?, ?)`,
    args: [guestUserId, targetUserId],
  });
  const users = new Map(
    parseRows(UserFlagsRowSchema, userRows, "user").map((u) => [u.id, u] as const),
  );
  const guest = users.get(guestUserId);
  const target = users.get(targetUserId);
  if (!guest) return errorResponse(c, 404, "guest user not found", "NOT_FOUND");
  if (!target) return errorResponse(c, 404, "target user not found", "NOT_FOUND");
  // Only guest → real-account merges: a typo'd direction would silently delete
  // a real member's login.
  if (!guest.guest) return errorResponse(c, 400, "source user is not a guest", "NOT_A_GUEST");
  if (target.guest) {
    return errorResponse(c, 400, "target must be a real account, not a guest", "TARGET_IS_GUEST");
  }

  // Every match naming the guest, via the participant index.
  const { rows: matchRows } = await db.execute({
    sql: `SELECT m.id, m.outcome_json FROM match_results m
          JOIN match_participants mp ON mp.match_id = m.id
          WHERE mp.user_id = ?`,
    args: [guestUserId],
  });

  const statements: InStatement[] = [];
  let matchesUpdated = 0;
  for (const row of parseRows(MatchOutcomeRowSchema, matchRows, "match_results")) {
    const outcome = MatchOutcomeSchema.parse(JSON.parse(row.outcome_json));
    const rewritten = replaceParticipant(outcome, guestUserId, {
      userId: targetUserId,
      displayName: target.name,
    });
    if (!rewritten) continue; // index row without a JSON occurrence — nothing to rewrite
    matchesUpdated += 1;
    const rewrittenJson = JSON.stringify(rewritten);
    statements.push({
      sql: `UPDATE match_results SET outcome_json = ?, updated_at = datetime('now')
             WHERE id = ? AND outcome_json = ?`,
      args: [rewrittenJson, row.id, row.outcome_json],
    });
    statements.push(
      ...participantSyncStatements(matchIdOf(row.id), rewritten, {
        replace: true,
        onlyIfOutcomeJson: rewrittenJson,
      }),
    );
  }
  statements.push(...transferStatements(guestUserId, targetUserId));
  // Last: remove the guest account — only once no match still names it. The
  // remaining cascades then only touch rows a guest cannot hold.
  statements.push({
    sql: `DELETE FROM "user"
           WHERE id = ? AND guest = 1
             AND NOT EXISTS (SELECT 1 FROM match_participants WHERE user_id = ?)`,
    args: [guestUserId, guestUserId],
  });
  const results = await db.batch(statements, "write");
  if ((results.at(-1)?.rowsAffected ?? 0) === 0) {
    return errorResponse(
      c,
      409,
      "the guest's match history changed during the merge — run it again",
      "MERGE_CONFLICT",
    );
  }

  logActivity(admin.id, "guest-merged", {
    guestName: guest.name,
    targetUserId,
    matchesUpdated,
  });
  return c.json(MergeGuestResponseSchema.parse({ ok: true, matchesUpdated }));
});
