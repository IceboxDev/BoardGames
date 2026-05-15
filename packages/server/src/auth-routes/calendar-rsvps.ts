import {
  ClearRsvpBodySchema,
  KickRsvpBodySchema,
  OkResponseSchema,
  SetRsvpBodySchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const calendarRsvpsRoutes = authedApp();

async function loadLockState(date: string): Promise<{
  locked: boolean;
  picksLocked: boolean;
  expected: Set<string>;
} | null> {
  const { rows } = await getDb().execute({
    sql: "SELECT expected_user_ids_json, picks_locked_at FROM locked_dates WHERE date_key = ? LIMIT 1",
    args: [date],
  });
  if (rows.length === 0) return { locked: false, picksLocked: false, expected: new Set() };
  const row = rows[0];
  let expected: unknown;
  try {
    expected = JSON.parse((row.expected_user_ids_json as string) ?? "[]");
  } catch {
    expected = [];
  }
  return {
    locked: true,
    picksLocked: (row.picks_locked_at as string | null) !== null,
    expected: new Set(Array.isArray(expected) ? (expected as string[]) : []),
  };
}

calendarRsvpsRoutes.post("/rsvp", zJsonBody(SetRsvpBodySchema), async (c) => {
  const user = c.get("user");
  const { date, status, auto } = c.req.valid("json");
  const autoFlag = auto ? 1 : 0;

  const lockState = await loadLockState(date);
  if (!lockState || !lockState.locked) {
    return errorResponse(c, 400, "date is not locked");
  }
  // When picks are locked, only users who were in the expected snapshot at
  // lock-in time may RSVP — late arrivals can't sneak in over a finalized
  // guest list. Existing attendees can still flip yes ↔ no.
  if (lockState.picksLocked && !lockState.expected.has(user.id)) {
    return errorResponse(c, 403, "guest list is locked", "GUEST_LIST_LOCKED");
  }

  // The auto flag tracks whether this came from a real button click
  // (auto=0) vs an automated mechanism (auto=1). Important: a manual click
  // that overwrites a prior auto row must reset auto to 0 so the attendees
  // view stops showing "Hasn't RSVP'd yet" for that user.
  await getDb().execute({
    sql: `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto)
          VALUES (?, ?, ?, datetime('now'), ?)
          ON CONFLICT(date_key, user_id) DO UPDATE SET
            status = excluded.status,
            rsvped_at = excluded.rsvped_at,
            auto = excluded.auto`,
    args: [date, user.id, status, autoFlag],
  });

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

  const lockedRow = await getDb().execute({
    sql: "SELECT host_user_id FROM locked_dates WHERE date_key = ? LIMIT 1",
    args: [date],
  });
  if (lockedRow.rows.length === 0) {
    return errorResponse(c, 400, "date is not locked");
  }
  const hostUserId = (lockedRow.rows[0].host_user_id as string | null) ?? null;
  const isAdmin = (user as { role?: string }).role === "admin";
  const isHost = hostUserId !== null && hostUserId === user.id;
  if (!isAdmin && !isHost) {
    return errorResponse(c, 403, "only admin or host can kick attendees", "FORBIDDEN");
  }
  if (userId === user.id) {
    return errorResponse(c, 400, "use /rsvp to change your own RSVP", "CANNOT_KICK_SELF");
  }

  await getDb().execute({
    sql: `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto)
          VALUES (?, ?, 'no', datetime('now'), 0)
          ON CONFLICT(date_key, user_id) DO UPDATE SET
            status = 'no',
            rsvped_at = excluded.rsvped_at,
            auto = 0`,
    args: [date, userId],
  });

  return c.json(OkResponseSchema.parse({ ok: true }));
});

calendarRsvpsRoutes.delete("/rsvp", zJsonBody(ClearRsvpBodySchema), async (c) => {
  const user = c.get("user");
  const { date } = c.req.valid("json");

  await getDb().execute({
    sql: "DELETE FROM rsvps WHERE date_key = ? AND user_id = ?",
    args: [date, user.id],
  });

  return c.json(OkResponseSchema.parse({ ok: true }));
});
