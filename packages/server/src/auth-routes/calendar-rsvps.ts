import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const calendarRsvpsRoutes = authedApp();

async function isLocked(date: string): Promise<boolean> {
  const { rows } = await getDb().execute({
    sql: "SELECT 1 FROM locked_dates WHERE date_key = ? LIMIT 1",
    args: [date],
  });
  return rows.length > 0;
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
  if (!(await isLocked(date))) {
    return c.json({ error: "date is not locked" }, 400);
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
