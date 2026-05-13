import {
  AvailableGamesQuerySchema,
  AvailableGamesSchema,
  CalendarLocksSchema,
  GameReactionBodySchema,
  LockInRequestBodySchema,
  LockInResponseSchema,
  OkResponseSchema,
  PicksLockBodySchema,
  UnlockBodySchema,
} from "@boardgames/core/protocol";
import { adminApp, authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { computeAvailableGamesPayload } from "../lib/available-games.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";

export const calendarLocksRoutes = authedApp();

calendarLocksRoutes.get("/games", zQuery(AvailableGamesQuerySchema), async (c) => {
  const user = c.get("user");
  const { date } = c.req.valid("query");
  const view = await computeAvailableGamesPayload({ db: getDb(), date, viewerId: user.id });
  if (!view) return errorResponse(c, 400, "date is not locked");
  return c.json(AvailableGamesSchema.parse(view.wire));
});

/**
 * Toggle the picks-lock on a locked date. Visible to admin AND host. When
 * locked, RSVPs from users not in the original `expected_user_ids` snapshot
 * are rejected — preventing last-second crashers from joining via the
 * calendar after the host has finalized the guest list.
 */
calendarLocksRoutes.post("/lock-picks", zJsonBody(PicksLockBodySchema), async (c) => {
  const user = c.get("user");
  const { date, on } = c.req.valid("json");

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
    return errorResponse(c, 403, "only admin or host can toggle picks-lock", "FORBIDDEN");
  }

  await getDb().execute({
    sql: on
      ? "UPDATE locked_dates SET picks_locked_at = datetime('now') WHERE date_key = ?"
      : "UPDATE locked_dates SET picks_locked_at = NULL WHERE date_key = ?",
    args: [date],
  });
  return c.json(OkResponseSchema.parse({ ok: true }));
});

calendarLocksRoutes.post("/games/reaction", zJsonBody(GameReactionBodySchema), async (c) => {
  const user = c.get("user");
  const { date, slug, reaction, on } = c.req.valid("json");

  const lockedRow = await getDb().execute({
    sql: "SELECT 1 FROM locked_dates WHERE date_key = ? LIMIT 1",
    args: [date],
  });
  if (lockedRow.rows.length === 0) {
    return errorResponse(c, 400, "date is not locked");
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

  return c.json(OkResponseSchema.parse({ ok: true }));
});

calendarLocksRoutes.get("/locks", async (c) => {
  const [locksResult, rsvpsResult, availabilityResult] = await Promise.all([
    getDb().execute(
      "SELECT date_key, locked_by, locked_at, expected_user_ids_json, host_user_id, host_name, event_time, address, picks_locked_at FROM locked_dates",
    ),
    getDb().execute("SELECT date_key, user_id, status FROM rsvps"),
    getDb().execute("SELECT user_id, availability_json FROM user_availability"),
  ]);

  // Build per-date sets we need to derive headcounts:
  //   canByDate / maybeByDate — declared availability
  //   yesByDate / noByDate    — explicit RSVP overrides
  // The N/N badge shown on the calendar cell is "RSVP yes / yes+maybe":
  //   N1 = definite attendees, N2 = definite + tentative.
  const canByDate = new Map<string, Set<string>>();
  const maybeByDate = new Map<string, Set<string>>();
  for (const row of availabilityResult.rows) {
    const userId = row.user_id as string;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.availability_json as string);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    for (const [date, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === "can") {
        let s = canByDate.get(date);
        if (!s) {
          s = new Set();
          canByDate.set(date, s);
        }
        s.add(userId);
      } else if (v === "maybe") {
        let s = maybeByDate.get(date);
        if (!s) {
          s = new Set();
          maybeByDate.set(date, s);
        }
        s.add(userId);
      }
    }
  }
  const yesByDate = new Map<string, Set<string>>();
  const noByDate = new Map<string, Set<string>>();
  for (const row of rsvpsResult.rows) {
    const date = row.date_key as string;
    const userId = row.user_id as string;
    const status = row.status as string;
    const map = status === "yes" ? yesByDate : status === "no" ? noByDate : null;
    if (!map) continue;
    let s = map.get(date);
    if (!s) {
      s = new Set();
      map.set(date, s);
    }
    s.add(userId);
  }

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
      picksLockedAt: string | null;
      attendance: { definite: number; tentative: number };
    }
  > = {};
  for (const row of locksResult.rows) {
    const date = row.date_key as string;
    let expected: unknown;
    try {
      expected = JSON.parse(row.expected_user_ids_json as string);
    } catch {
      expected = [];
    }
    const hostUserId = row.host_user_id as string | null;
    const hostName = row.host_name as string | null;
    const picksLockedAt = (row.picks_locked_at as string | null) ?? null;

    const cans = canByDate.get(date) ?? new Set<string>();
    const maybes = maybeByDate.get(date) ?? new Set<string>();
    const yes = yesByDate.get(date) ?? new Set<string>();
    const no = noByDate.get(date) ?? new Set<string>();
    // definite = (cans ∪ rsvpYes) − rsvpNo
    const definite = new Set<string>();
    for (const id of cans) if (!no.has(id)) definite.add(id);
    for (const id of yes) if (!no.has(id)) definite.add(id);
    // tentative = maybes − definite − rsvpNo
    let tentativeCount = 0;
    for (const id of maybes) {
      if (!definite.has(id) && !no.has(id)) tentativeCount++;
    }

    out[date] = {
      lockedBy: row.locked_by as string,
      lockedAt: row.locked_at as string,
      expectedUserIds: Array.isArray(expected) ? (expected as string[]) : [],
      rsvps: {},
      host: hostUserId ? { userId: hostUserId, name: hostName ?? "" } : null,
      picksLockedAt,
      eventTime: (row.event_time as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      attendance: { definite: definite.size, tentative: tentativeCount },
    };
  }
  for (const row of rsvpsResult.rows) {
    const dateKey = row.date_key as string;
    const status = row.status as "yes" | "no";
    const userId = row.user_id as string;
    const entry = out[dateKey];
    if (entry) entry.rsvps[userId] = status;
  }

  return c.json(CalendarLocksSchema.parse(out));
});

export const adminCalendarLocksRoutes = adminApp();

adminCalendarLocksRoutes.post("/lock", zJsonBody(LockInRequestBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const date = body.date;
  const hostUserId = body.hostUserId ?? null;
  const hostName = body.hostName ?? null;
  const eventTime = body.eventTime ?? null;
  const address = body.address ?? null;

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
  // — the lock just confirms the date — so no separate click is required for
  // the headcount math. The `auto = 1` flag distinguishes these from real
  // button clicks; the attendees view surfaces a "Hasn't RSVP'd yet" pill
  // for auto rows so the host can ping them in real life.
  // OR IGNORE preserves any explicit choice (e.g. a can who later flipped to
  // "no" survives a re-lock).
  const stmts: { sql: string; args: (string | number | null)[] }[] = [
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
    // Re-locking the same date invalidates any tombstone — the night is
    // back on, so iCalendar subscribers should see a CONFIRMED event with
    // a bumped SEQUENCE rather than a lingering CANCELLED.
    { sql: "DELETE FROM calendar_unlocked_tombstones WHERE date_key = ?", args: [date] },
  ];
  for (const id of cans) {
    stmts.push({
      sql: `INSERT OR IGNORE INTO rsvps (date_key, user_id, status, rsvped_at, auto)
            VALUES (?, ?, 'yes', datetime('now'), 1)`,
      args: [date, id],
    });
  }
  await getDb().batch(stmts, "write");

  return c.json(LockInResponseSchema.parse({ ok: true, expectedUserIds: expected }));
});

adminCalendarLocksRoutes.delete("/lock", zJsonBody(UnlockBodySchema), async (c) => {
  const { date } = c.req.valid("json");

  // Cascade: drop the lock row, its RSVPs, and any game reactions for the
  // date. We used to keep RSVPs and reactions across unlock so an explicit
  // "no" (or hype vote) survived an unlock+re-lock cycle, but that left
  // orphans pointing at no game night — and once the availability views
  // started honoring `rsvp.yes` as an implicit "can", those orphans turned
  // into ghost availability that snapped back over the user's edits.
  //
  // Before the delete, copy the lock metadata into a tombstone row so the
  // iCalendar feed can emit STATUS:CANCELLED for ~30 days. Without this,
  // calendars that already saw the event would keep it forever — clients
  // only act on what they see; absence doesn't trigger cleanup.
  await getDb().batch(
    [
      {
        sql: `INSERT OR REPLACE INTO calendar_unlocked_tombstones
                (date_key, expected_user_ids_json, host_user_id, host_name,
                 event_time, address, unlocked_at)
              SELECT date_key, expected_user_ids_json, host_user_id, host_name,
                     event_time, address, datetime('now')
              FROM locked_dates WHERE date_key = ?`,
        args: [date],
      },
      { sql: "DELETE FROM rsvps WHERE date_key = ?", args: [date] },
      { sql: "DELETE FROM game_requests WHERE date_key = ?", args: [date] },
      { sql: "DELETE FROM locked_dates WHERE date_key = ?", args: [date] },
    ],
    "write",
  );

  return c.json(OkResponseSchema.parse({ ok: true }));
});
