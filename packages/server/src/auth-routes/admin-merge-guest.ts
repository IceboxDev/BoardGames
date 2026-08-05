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
// Fold a guest stub into a real account. Guests exist only inside match
// outcomes (no RSVPs, availability, sessions, …), so the merge is: rewrite
// every outcome naming the guest to the target's id + real display name,
// resync the match_participants index for those matches, then delete the
// guest user — all in one atomic batch. Stats need no further work: they are
// derived from outcomes at read time, so they move with the rewrite.

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
    statements.push({
      sql: `UPDATE match_results SET outcome_json = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [JSON.stringify(rewritten), row.id],
    });
    statements.push(...participantSyncStatements(matchIdOf(row.id), rewritten, { replace: true }));
  }
  // Last: remove the guest account. FK cascades clean up anything residual
  // still pointing at the guest (by then, nothing should).
  statements.push({ sql: `DELETE FROM "user" WHERE id = ?`, args: [guestUserId] });
  await db.batch(statements, "write");

  logActivity(admin.id, "guest-merged", {
    guestName: guest.name,
    targetUserId,
    matchesUpdated,
  });
  return c.json(MergeGuestResponseSchema.parse({ ok: true, matchesUpdated }));
});
