import { Hono } from "hono";
import { auth } from "../auth.ts";
import { getDb } from "../db.ts";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const calendarLocksRoutes = new Hono();

calendarLocksRoutes.get("/locks", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);

  const { rows } = await getDb().execute(
    "SELECT date_key, locked_by, locked_at, expected_user_ids_json FROM locked_dates",
  );

  const out: Record<string, { lockedBy: string; lockedAt: string; expectedUserIds: string[] }> = {};
  for (const row of rows) {
    let expected: unknown;
    try {
      expected = JSON.parse(row.expected_user_ids_json as string);
    } catch {
      expected = [];
    }
    out[row.date_key as string] = {
      lockedBy: row.locked_by as string,
      lockedAt: row.locked_at as string,
      expectedUserIds: Array.isArray(expected) ? (expected as string[]) : [],
    };
  }

  return c.json(out);
});

export const adminCalendarLocksRoutes = new Hono();

adminCalendarLocksRoutes.post("/lock", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);
  if ((session.user as { role?: string }).role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as { date?: unknown };
  const date = body.date;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }

  // Snapshot the set of users who marked can/maybe at lock time so slice 4
  // can decide "fully RSVPed" against a frozen baseline.
  const { rows } = await getDb().execute(
    "SELECT user_id, availability_json FROM user_availability",
  );
  const expected: string[] = [];
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.availability_json as string);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const v = (parsed as Record<string, unknown>)[date];
    if (v === "can" || v === "maybe") {
      expected.push(row.user_id as string);
    }
  }

  await getDb().execute({
    sql: `INSERT INTO locked_dates (date_key, locked_by, locked_at, expected_user_ids_json)
          VALUES (?, ?, datetime('now'), ?)
          ON CONFLICT(date_key) DO UPDATE SET
            locked_by = excluded.locked_by,
            locked_at = excluded.locked_at,
            expected_user_ids_json = excluded.expected_user_ids_json`,
    args: [date, session.user.id, JSON.stringify(expected)],
  });

  return c.json({ ok: true, expectedUserIds: expected });
});

adminCalendarLocksRoutes.delete("/lock", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);
  if ((session.user as { role?: string }).role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as { date?: unknown };
  const date = body.date;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }

  await getDb().execute({
    sql: "DELETE FROM locked_dates WHERE date_key = ?",
    args: [date],
  });

  return c.json({ ok: true });
});
