import {
  ClearRsvpBodySchema,
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

calendarRsvpsRoutes.delete("/rsvp", zJsonBody(ClearRsvpBodySchema), async (c) => {
  const user = c.get("user");
  const { date } = c.req.valid("json");

  await getDb().execute({
    sql: "DELETE FROM rsvps WHERE date_key = ? AND user_id = ?",
    args: [date, user.id],
  });

  return c.json(OkResponseSchema.parse({ ok: true }));
});
