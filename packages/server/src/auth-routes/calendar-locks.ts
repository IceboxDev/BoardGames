import { adminApp, authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const REACTION_KINDS = new Set(["hype", "teach", "learn"]);

export const calendarLocksRoutes = authedApp();

calendarLocksRoutes.get("/games", async (c) => {
  const user = c.get("user");
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

  // Compute participant set. `rsvp:no` is an explicit decline — it overrides
  // any availability marker, including an earlier `rsvp:yes`. Only people who
  // are actually coming contribute to the inventory union or to the headcount;
  // a "maybe" who hasn't declined widens the headcount upper bound but never
  // contributes inventory (we can't count on them showing up with the box).
  const [availabilityResult, rsvpResult, reactionResult] = await Promise.all([
    getDb().execute("SELECT user_id, availability_json FROM user_availability"),
    getDb().execute({
      sql: "SELECT user_id, status FROM rsvps WHERE date_key = ?",
      args: [date],
    }),
    getDb().execute({
      sql: "SELECT user_id, game_slug, reaction FROM game_requests WHERE date_key = ?",
      args: [date],
    }),
  ]);

  const canSet = new Set<string>();
  const maybeSet = new Set<string>();
  for (const row of availabilityResult.rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.availability_json as string);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const v = (parsed as Record<string, unknown>)[date];
    const userId = row.user_id as string;
    if (v === "can") canSet.add(userId);
    else if (v === "maybe") maybeSet.add(userId);
  }

  const rsvpYes = new Set<string>();
  const rsvpNo = new Set<string>();
  for (const row of rsvpResult.rows) {
    const userId = row.user_id as string;
    const status = row.status as string;
    if (status === "yes") rsvpYes.add(userId);
    else if (status === "no") rsvpNo.add(userId);
  }

  // Explicit "no" wins over everything else.
  const comingIds = new Set<string>();
  for (const id of canSet) if (!rsvpNo.has(id)) comingIds.add(id);
  for (const id of rsvpYes) if (!rsvpNo.has(id)) comingIds.add(id);
  const definiteIds = [...comingIds];
  const tentativeIds = [...maybeSet].filter((id) => !comingIds.has(id) && !rsvpNo.has(id));

  let ownedSlugs: string[] = [];
  if (definiteIds.length > 0) {
    const placeholders = definiteIds.map(() => "?").join(",");
    const inventoryResult = await getDb().execute({
      sql: `SELECT game_slugs_json FROM user_inventory WHERE user_id IN (${placeholders})`,
      args: definiteIds,
    });

    // Union: any one confirmed attendee owning a game means the group can
    // play it (whoever owns it brings it to the night).
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

  type ReactionAggregate = {
    hype: number;
    teach: number;
    learn: number;
    viewer: ("hype" | "teach" | "learn")[];
  };
  const reactions: Record<string, ReactionAggregate> = {};
  for (const row of reactionResult.rows) {
    const slug = row.game_slug as string;
    const kind = row.reaction as "hype" | "teach" | "learn";
    let agg = reactions[slug];
    if (!agg) {
      agg = { hype: 0, teach: 0, learn: 0, viewer: [] };
      reactions[slug] = agg;
    }
    agg[kind] += 1;
    if ((row.user_id as string) === user.id) agg.viewer.push(kind);
  }

  return c.json({
    ownedSlugs,
    definiteCount: definiteIds.length,
    tentativeCount: tentativeIds.length,
    participantIds: definiteIds,
    reactions,
  });
});

calendarLocksRoutes.post("/games/reaction", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as {
    date?: unknown;
    slug?: unknown;
    reaction?: unknown;
    on?: unknown;
  };

  const { date, slug, reaction, on } = body;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }
  if (typeof slug !== "string" || slug.length === 0) {
    return c.json({ error: "invalid slug" }, 400);
  }
  if (typeof reaction !== "string" || !REACTION_KINDS.has(reaction)) {
    return c.json({ error: "invalid reaction" }, 400);
  }
  if (typeof on !== "boolean") {
    return c.json({ error: "invalid on" }, 400);
  }

  const lockedRow = await getDb().execute({
    sql: "SELECT 1 FROM locked_dates WHERE date_key = ? LIMIT 1",
    args: [date],
  });
  if (lockedRow.rows.length === 0) {
    return c.json({ error: "date is not locked" }, 400);
  }

  if (on) {
    await getDb().execute({
      sql: `INSERT OR IGNORE INTO game_requests (date_key, user_id, game_slug, reaction)
            VALUES (?, ?, ?, ?)`,
      args: [date, user.id, slug, reaction],
    });
  } else {
    await getDb().execute({
      sql: `DELETE FROM game_requests
            WHERE date_key = ? AND user_id = ? AND game_slug = ? AND reaction = ?`,
      args: [date, user.id, slug, reaction],
    });
  }

  return c.json({ ok: true });
});

calendarLocksRoutes.get("/locks", async (c) => {
  const [locksResult, rsvpsResult] = await Promise.all([
    getDb().execute(
      "SELECT date_key, locked_by, locked_at, expected_user_ids_json, host_user_id, host_name, event_time, address FROM locked_dates",
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
      host: { userId: string; name: string } | null;
      eventTime: string | null;
      address: string | null;
    }
  > = {};
  for (const row of locksResult.rows) {
    let expected: unknown;
    try {
      expected = JSON.parse(row.expected_user_ids_json as string);
    } catch {
      expected = [];
    }
    const hostUserId = row.host_user_id as string | null;
    const hostName = row.host_name as string | null;
    out[row.date_key as string] = {
      lockedBy: row.locked_by as string,
      lockedAt: row.locked_at as string,
      expectedUserIds: Array.isArray(expected) ? (expected as string[]) : [],
      rsvps: {},
      host: hostUserId ? { userId: hostUserId, name: hostName ?? "" } : null,
      eventTime: (row.event_time as string | null) ?? null,
      address: (row.address as string | null) ?? null,
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

const TIME_RE = /^\d{2}:\d{2}$/;

function asOptionalString(v: unknown, max = 500): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  return v.length > max ? v.slice(0, max) : v;
}

adminCalendarLocksRoutes.post("/lock", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as {
    date?: unknown;
    hostUserId?: unknown;
    hostName?: unknown;
    eventTime?: unknown;
    address?: unknown;
  };
  const date = body.date;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }
  const hostUserId = asOptionalString(body.hostUserId, 100);
  const hostName = asOptionalString(body.hostName, 200);
  const eventTimeRaw = asOptionalString(body.eventTime, 5);
  const eventTime = eventTimeRaw && TIME_RE.test(eventTimeRaw) ? eventTimeRaw : null;
  const address = asOptionalString(body.address, 500);

  // Snapshot the set of users who marked can/maybe at lock time so we can
  // decide "fully RSVPed" against a frozen baseline. Track cans separately
  // so we can auto-confirm them as RSVP "yes".
  const { rows } = await getDb().execute(
    "SELECT user_id, availability_json FROM user_availability",
  );
  const expected: string[] = [];
  const cans: string[] = [];
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.availability_json as string);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const v = (parsed as Record<string, unknown>)[date];
    const userId = row.user_id as string;
    if (v === "can") {
      expected.push(userId);
      cans.push(userId);
    } else if (v === "maybe") {
      expected.push(userId);
    }
  }

  // Auto-RSVP "yes" for every can. They've already committed via availability
  // — the lock just confirms the date — so no separate click is required.
  // OR IGNORE preserves any explicit choice (e.g. a can who later flipped to
  // "no" survives a re-lock).
  const stmts: { sql: string; args: (string | null)[] }[] = [
    {
      sql: `INSERT INTO locked_dates
              (date_key, locked_by, locked_at, expected_user_ids_json,
               host_user_id, host_name, event_time, address)
            VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)
            ON CONFLICT(date_key) DO UPDATE SET
              locked_by = excluded.locked_by,
              locked_at = excluded.locked_at,
              expected_user_ids_json = excluded.expected_user_ids_json,
              host_user_id = excluded.host_user_id,
              host_name = excluded.host_name,
              event_time = excluded.event_time,
              address = excluded.address`,
      args: [date, user.id, JSON.stringify(expected), hostUserId, hostName, eventTime, address],
    },
  ];
  for (const id of cans) {
    stmts.push({
      sql: `INSERT OR IGNORE INTO rsvps (date_key, user_id, status, rsvped_at)
            VALUES (?, ?, 'yes', datetime('now'))`,
      args: [date, id],
    });
  }
  await getDb().batch(stmts, "write");

  return c.json({ ok: true, expectedUserIds: expected });
});

adminCalendarLocksRoutes.delete("/lock", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { date?: unknown };
  const date = body.date;
  if (typeof date !== "string" || !DATE_KEY_RE.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }

  // Drop only the lock row. RSVPs and reactions stay so an explicit "no" (or
  // a hyped game) survives an unlock + re-lock cycle — otherwise the lock
  // handler's auto-RSVP-yes-for-cans flips a "no" voter back to "yes" without
  // them clicking anything, and their inventory re-enters the games list.
  await getDb().execute({
    sql: "DELETE FROM locked_dates WHERE date_key = ?",
    args: [date],
  });

  return c.json({ ok: true });
});
