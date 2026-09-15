import {
  ClearRsvpBodySchema,
  KickRsvpBodySchema,
  OkResponseSchema,
  SetRsvpBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { parseRow } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { loadNightLock, type NightLock } from "../lib/night-participants.ts";

export const calendarRsvpsRoutes = authedApp();

/** `SELECT status FROM rsvps` — pre-upsert read for change-aware logging. */
const RsvpStatusRowSchema = z.object({ status: z.enum(["yes", "no"]) });

/**
 * An RSVP's timestamp is the seat queue on a private night, so it carries
 * milliseconds: two taps in the same second must still have an order.
 * Every reader compares these lexically or parses the leading
 * "YYYY-MM-DD HH:MM:SS", both of which are unaffected by the suffix.
 */
export const RSVP_NOW = "strftime('%Y-%m-%d %H:%M:%f', 'now')";

/**
 * Upsert one RSVP. The timestamp only moves when the ANSWER changes: the
 * client re-sends "yes" on every open of a night's card, and on a private
 * night a fresh stamp would send a seated guest to the back of the line.
 */
export const UPSERT_RSVP_SQL = `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto)
      VALUES (?, ?, ?, ${RSVP_NOW}, ?)
      ON CONFLICT(date_key, user_id) DO UPDATE SET
        status = excluded.status,
        rsvped_at = CASE WHEN rsvps.status = excluded.status THEN rsvps.rsvped_at ELSE excluded.rsvped_at END,
        auto = excluded.auto`;

function isAdminUser(user: unknown): boolean {
  return (user as { role?: string }).role === "admin";
}

/**
 * Whether `userId` may answer for this night. Open nights are open until the
 * guest list is sealed; from then on (and on a private night from the start,
 * where the guest list IS the invitation) only the expected set may answer.
 */
function rsvpRefusal(
  lock: NightLock,
  userId: string,
): { status: 403; code: string; msg: string } | null {
  const expected = new Set(lock.expectedUserIds);
  if (lock.hostUserId) expected.add(lock.hostUserId);
  if (lock.isPrivate && !expected.has(userId)) {
    return { status: 403, code: "NOT_INVITED", msg: "this night is invitation only" };
  }
  if (!lock.isPrivate && lock.picksLockedAt !== null && !expected.has(userId)) {
    return { status: 403, code: "GUEST_LIST_LOCKED", msg: "guest list is locked" };
  }
  return null;
}

calendarRsvpsRoutes.post("/rsvp", zJsonBody(SetRsvpBodySchema), async (c) => {
  const user = c.get("user");
  const { date, status, auto } = c.req.valid("json");

  const lock = await loadNightLock(getDb(), date);
  if (!lock) {
    return errorResponse(c, 400, "date is not locked");
  }
  const refusal = rsvpRefusal(lock, user.id);
  if (refusal) return errorResponse(c, refusal.status, refusal.msg, refusal.code);
  // The host of a private night holds seat 1 by definition; leaving means the
  // night is off, which is the admin's call (unlock), not an RSVP.
  if (lock.isPrivate && user.id === lock.hostUserId && status === "no") {
    return errorResponse(c, 400, "the host can't sit out their own night", "HOST_CANNOT_LEAVE");
  }
  // Seats are claimed by a real answer; nothing automatic ever claims one.
  const autoFlag = auto && !lock.isPrivate ? 1 : 0;

  // Current status BEFORE the upsert, so activity logging can tell a real
  // change from a no-op re-send. Re-sends are routine: RsvpModal silently
  // re-POSTs "yes" every time a non-"no" viewer opens an open night's card
  // (to promote lock-batch auto-yes rows to manual), which would otherwise
  // spam the activity trail with phantom "RSVP'd yes" entries.
  const existingResult = await getDb().execute({
    sql: "SELECT status FROM rsvps WHERE date_key = ? AND user_id = ? LIMIT 1",
    args: [date, user.id],
  });
  const previous = existingResult.rows[0]
    ? parseRow(RsvpStatusRowSchema, existingResult.rows[0], "rsvps").status
    : null;

  // The auto flag tracks whether this came from a real button click
  // (auto=0) vs an automated mechanism (auto=1). Important: a manual click
  // that overwrites a prior auto row must reset auto to 0 so the attendees
  // view stops showing "Hasn't RSVP'd yet" for that user.
  await getDb().execute({ sql: UPSERT_RSVP_SQL, args: [date, user.id, status, autoFlag] });
  // Only status CHANGES are activity; a re-confirmation of the same answer
  // is not. `previous` lets the drawer render "Changed RSVP from yes to no".
  if (previous !== status) {
    logActivity(user.id, "rsvp", {
      date,
      status,
      ...(previous ? { previous } : {}),
      ...(autoFlag ? { auto: true } : {}),
      ...(lock.isPrivate ? { private: true } : {}),
    });
  }

  return c.json(OkResponseSchema.parse({ ok: true }));
});

/**
 * Host/admin-only kick: force another user's RSVP for `date` to "no". The
 * attendees view's X button calls this when someone backs out by text rather
 * than in-app. We bypass the picks-lock expected-set check here — privileged
 * actors should always be able to trim the guest list.
 */
calendarRsvpsRoutes.post("/rsvp/kick", zJsonBody(KickRsvpBodySchema), async (c) => {
  const user = c.get("user");
  const { date, userId } = c.req.valid("json");

  const lock = await loadNightLock(getDb(), date);
  if (!lock) {
    return errorResponse(c, 400, "date is not locked");
  }
  const hostUserId = lock.hostUserId;
  const isAdmin = isAdminUser(user);
  const isHost = hostUserId !== null && hostUserId === user.id;
  if (!isAdmin && !isHost) {
    return errorResponse(c, 403, "only admin or host can kick attendees", "FORBIDDEN");
  }
  if (userId === user.id) {
    return errorResponse(c, 400, "use /rsvp to change your own RSVP", "CANNOT_KICK_SELF");
  }
  if (lock.isPrivate && userId === hostUserId) {
    return errorResponse(
      c,
      400,
      "the host holds seat 1 — unlock the night instead",
      "HOST_NOT_REMOVABLE",
    );
  }

  await getDb().execute({
    sql: `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto)
          VALUES (?, ?, 'no', ${RSVP_NOW}, 0)
          ON CONFLICT(date_key, user_id) DO UPDATE SET
            status = 'no',
            rsvped_at = excluded.rsvped_at,
            auto = 0`,
    args: [date, userId],
  });
  logActivity(user.id, "rsvp-kick", { date, targetUserId: userId });

  return c.json(OkResponseSchema.parse({ ok: true }));
});

calendarRsvpsRoutes.delete("/rsvp", zJsonBody(ClearRsvpBodySchema), async (c) => {
  const user = c.get("user");
  const { date } = c.req.valid("json");

  const lock = await loadNightLock(getDb(), date);
  if (lock?.isPrivate && user.id === lock.hostUserId) {
    return errorResponse(c, 400, "the host can't sit out their own night", "HOST_CANNOT_LEAVE");
  }

  const result = await getDb().execute({
    sql: "DELETE FROM rsvps WHERE date_key = ? AND user_id = ?",
    args: [date, user.id],
  });
  // Deleting nothing isn't activity.
  if (result.rowsAffected > 0) {
    logActivity(user.id, "rsvp-cleared", { date });
  }

  return c.json(OkResponseSchema.parse({ ok: true }));
});
