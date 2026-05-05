import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

calendarRsvpsRoutes.post("/rsvp", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as {
    date?: unknown;
    status?: unknown;
  };
  const date = body.date;
  const status = body.status;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }
  if (status !== "yes" && status !== "no") {
    return c.json({ error: "status must be 'yes' or 'no'" }, 400);
  }
  const lockState = await loadLockState(date);
  if (!lockState || !lockState.locked) {
    return c.json({ error: "date is not locked" }, 400);
  }
  // When picks are locked, only users who were in the expected snapshot at
  // lock-in time may RSVP — late arrivals can't sneak in over a finalized
  // guest list. Existing attendees can still flip yes ↔ no.
  if (lockState.picksLocked && !lockState.expected.has(user.id)) {
    return c.json({ error: "guest list is locked" }, 403);
  }

  await getDb().execute({
    sql: `INSERT INTO rsvps (date_key, user_id, status, rsvped_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(date_key, user_id) DO UPDATE SET
            status = excluded.status,
            rsvped_at = excluded.rsvped_at`,
    args: [date, user.id, status],
  });

  return c.json({ ok: true });
});

calendarRsvpsRoutes.delete("/rsvp", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as { date?: unknown };
  const date = body.date;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }

  await getDb().execute({
    sql: "DELETE FROM rsvps WHERE date_key = ? AND user_id = ?",
    args: [date, user.id],
  });

  return c.json({ ok: true });
});
