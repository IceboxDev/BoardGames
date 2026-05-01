import { adminApp, authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const calendarLocksRoutes = authedApp();

calendarLocksRoutes.get("/games", async (c) => {
  const date = c.req.query("date");
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }

  const lockedRow = await getDb().execute({
    sql: "SELECT 1 FROM locked_dates WHERE date_key = ? LIMIT 1",
    args: [date],
  });
  if (lockedRow.rows.length === 0) {
    return c.json({ error: "date is not locked" }, 400);
  }

  // Compute participant set:
  //   (users with availability "can" for this date) ∪ (users with rsvp "yes")
  //   minus (users with rsvp "no")
  const [availabilityResult, rsvpResult] = await Promise.all([
    getDb().execute("SELECT user_id, availability_json FROM user_availability"),
    getDb().execute({
      sql: "SELECT user_id, status FROM rsvps WHERE date_key = ?",
      args: [date],
    }),
  ]);

  const canSet = new Set<string>();
  for (const row of availabilityResult.rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.availability_json as string);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const v = (parsed as Record<string, unknown>)[date];
    if (v === "can") canSet.add(row.user_id as string);
  }

  const rsvpYes = new Set<string>();
  const rsvpNo = new Set<string>();
  for (const row of rsvpResult.rows) {
    const userId = row.user_id as string;
    const status = row.status as string;
    if (status === "yes") rsvpYes.add(userId);
    else if (status === "no") rsvpNo.add(userId);
  }

  const participantIds = [...new Set([...canSet, ...rsvpYes])].filter((id) => !rsvpNo.has(id));

  let ownedSlugs: string[] = [];
  if (participantIds.length > 0) {
    const placeholders = participantIds.map(() => "?").join(",");
    const inventoryResult = await getDb().execute({
      sql: `SELECT game_slugs_json FROM user_inventory WHERE user_id IN (${placeholders})`,
      args: participantIds,
    });

    // Union: any one participant owning a game means the group can play it
    // (whoever owns it brings it to the night).
    const union = new Set<string>();
    for (const row of inventoryResult.rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.game_slugs_json as string);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const slug of parsed) {
        if (typeof slug === "string") union.add(slug);
      }
    }
    ownedSlugs = [...union].sort();
  }

  return c.json({
    ownedSlugs,
    participantCount: participantIds.length,
    participantIds,
  });
});

calendarLocksRoutes.get("/locks", async (c) => {
  const [locksResult, rsvpsResult] = await Promise.all([
    getDb().execute(
      "SELECT date_key, locked_by, locked_at, expected_user_ids_json FROM locked_dates",
    ),
    getDb().execute("SELECT date_key, user_id, status FROM rsvps"),
  ]);

  const out: Record<
    string,
    {
      lockedBy: string;
      lockedAt: string;
      expectedUserIds: string[];
      rsvps: Record<string, "yes" | "no">;
    }
  > = {};
  for (const row of locksResult.rows) {
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
      rsvps: {},
    };
  }
  for (const row of rsvpsResult.rows) {
    const dateKey = row.date_key as string;
    const status = row.status as "yes" | "no";
    const userId = row.user_id as string;
    const entry = out[dateKey];
    if (entry) entry.rsvps[userId] = status;
  }

  return c.json(out);
});

export const adminCalendarLocksRoutes = adminApp();

adminCalendarLocksRoutes.post("/lock", async (c) => {
  const user = c.get("user");
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
    args: [date, user.id, JSON.stringify(expected)],
  });

  return c.json({ ok: true, expectedUserIds: expected });
});

adminCalendarLocksRoutes.delete("/lock", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { date?: unknown };
  const date = body.date;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }

  // Cascade-delete RSVPs so they don't resurface if this date is later re-locked.
  await getDb().batch(
    [
      { sql: "DELETE FROM locked_dates WHERE date_key = ?", args: [date] },
      { sql: "DELETE FROM rsvps WHERE date_key = ?", args: [date] },
    ],
    "write",
  );

  return c.json({ ok: true });
});
