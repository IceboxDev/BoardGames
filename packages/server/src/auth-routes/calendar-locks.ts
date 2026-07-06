import {
  AvailableGamesQuerySchema,
  AvailableGamesSchema,
  CalendarLocksSchema,
  GameReactionBodySchema,
  HostStatsMapSchema,
  LockInRequestBodySchema,
  LockInResponseSchema,
  OkResponseSchema,
  PicksLockBodySchema,
  SlugListSchema,
  UnlockBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp, authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import {
  computeAvailableGamesPayload,
  computePlayableSlugs,
  rankTopSlugs,
} from "../lib/available-games.ts";
import { jsonColumn, parseRow, parseRows, RowParseError } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";

export const calendarLocksRoutes = authedApp();

// ── Row projections ───────────────────────────────────────────────────
//
// One projection per `SELECT` list. Columns appear in the same order
// here as in the SQL so a column rename in `db.ts` surfaces in this
// file as a diff in the same PR.

/** Stored as a JSON-encoded array of better-auth user ids. */
const ExpectedUserIdsSchema = z.array(z.string());

/** `SELECT host_user_id FROM locked_dates WHERE date_key = ?`. */
const HostUserIdRowSchema = z.object({
  host_user_id: z.string().nullable(),
});

/** `SELECT expected_user_ids_json FROM locked_dates WHERE date_key = ?`. */
const ExpectedUserIdsRowSchema = z.object({
  expected_user_ids_json: jsonColumn(ExpectedUserIdsSchema),
});

/** `SELECT user_id FROM rsvps WHERE date_key = ? AND status = 'yes'`. */
const RsvpUserIdRowSchema = z.object({ user_id: z.string() });

/** `SELECT user_id, date_key, status FROM user_availability_days` — normalized
 *  per-date availability (migration 0010). */
const AvailabilityDayRowSchema = z.object({
  user_id: z.string(),
  date_key: z.string(),
  status: z.enum(["can", "maybe"]),
});

/** `SELECT user_id, status FROM user_availability_days WHERE date_key = ?`. */
const AvailabilityDayForDateRowSchema = z.object({
  user_id: z.string(),
  status: z.enum(["can", "maybe"]),
});

/** `SELECT date_key, user_id, status FROM rsvps`. */
const RsvpRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
});

/**
 * `SELECT date_key, user_id, game_slug, reaction FROM game_requests` —
 * scoped to locked dates. Feeds the per-night vote-winner (`topGameSlug`).
 */
const GameRequestRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  game_slug: z.string(),
  reaction: z.enum(["hype", "teach", "learn"]),
});

/** `SELECT user_id, game_slugs_json FROM user_inventory`. */
const InventoryRowSchema = z.object({
  user_id: z.string(),
  game_slugs_json: jsonColumn(SlugListSchema),
});

/**
 * `SELECT date_key, locked_by, locked_at, expected_user_ids_json,
 *  host_user_id, host_name, event_time, address, picks_locked_at,
 *  host_at_home FROM locked_dates`.
 *
 * `host_at_home` is stored as `INTEGER` (0/1/NULL); the wire-side
 * normalization (`null → true`) lives in the GET handler.
 */
const LockedDateRowSchema = z.object({
  date_key: z.string(),
  locked_by: z.string(),
  locked_at: z.string(),
  expected_user_ids_json: jsonColumn(ExpectedUserIdsSchema),
  host_user_id: z.string().nullable(),
  host_name: z.string().nullable(),
  event_time: z.string().nullable(),
  address: z.string().nullable(),
  picks_locked_at: z.string().nullable(),
  host_at_home: z.number().nullable(),
});

// ── Routes ────────────────────────────────────────────────────────────

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
  const { host_user_id: hostUserId } = parseRow(
    HostUserIdRowSchema,
    lockedRow.rows[0],
    "locked_dates",
  );
  const isAdmin = (user as { role?: string }).role === "admin";
  const isHost = hostUserId !== null && hostUserId === user.id;
  if (!isAdmin && !isHost) {
    return errorResponse(c, 403, "only admin or host can toggle picks-lock", "FORBIDDEN");
  }

  if (on) {
    // Snapshot the guest list at picks-lock time. The date-lock snapshot was
    // taken when the host first locked the date and only sees users who had
    // marked availability by then — anyone who RSVPed yes later (e.g. via
    // the modal without ever touching the availability calendar) was getting
    // shut out of the modal once picks were locked. Union the original
    // snapshot with every current `yes` RSVP so the guest list at picks-lock
    // time actually reflects who has committed to the night.
    const [{ rows: lockRows }, { rows: yesRows }] = await Promise.all([
      getDb().execute({
        sql: "SELECT expected_user_ids_json FROM locked_dates WHERE date_key = ?",
        args: [date],
      }),
      getDb().execute({
        sql: "SELECT user_id FROM rsvps WHERE date_key = ? AND status = 'yes'",
        args: [date],
      }),
    ]);

    // The lock row was confirmed to exist a few lines up; if the
    // expected-user blob is corrupt, treat it as empty (the union with
    // current `yes` RSVPs below is the real source of truth here).
    let originalExpected: string[] = [];
    if (lockRows[0]) {
      try {
        originalExpected = parseRow(
          ExpectedUserIdsRowSchema,
          lockRows[0],
          "locked_dates",
        ).expected_user_ids_json;
      } catch (err) {
        if (!(err instanceof RowParseError)) throw err;
      }
    }
    const expected = new Set<string>(originalExpected);
    for (const r of parseRows(RsvpUserIdRowSchema, yesRows, "rsvps")) expected.add(r.user_id);

    await getDb().execute({
      sql: `UPDATE locked_dates
              SET picks_locked_at = datetime('now'),
                  expected_user_ids_json = ?
            WHERE date_key = ?`,
      args: [JSON.stringify([...expected]), date],
    });
  } else {
    await getDb().execute({
      sql: "UPDATE locked_dates SET picks_locked_at = NULL WHERE date_key = ?",
      args: [date],
    });
  }
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
  const [locksResult, rsvpsResult, availabilityResult, reactionsResult, inventoryResult] =
    await Promise.all([
      getDb().execute(
        "SELECT date_key, locked_by, locked_at, expected_user_ids_json, host_user_id, host_name, event_time, address, picks_locked_at, host_at_home FROM locked_dates",
      ),
      getDb().execute("SELECT date_key, user_id, status FROM rsvps"),
      getDb().execute(
        "SELECT user_id, date_key, status FROM user_availability_days WHERE date_key IN (SELECT date_key FROM locked_dates)",
      ),
      // Reactions for locked nights only — feeds each night's vote-winner.
      // Scoped to locked dates so the scan grows with game nights, not with
      // the whole reaction history.
      getDb().execute(
        "SELECT date_key, user_id, game_slug, reaction FROM game_requests WHERE date_key IN (SELECT date_key FROM locked_dates)",
      ),
      getDb().execute("SELECT user_id, game_slugs_json FROM user_inventory"),
    ]);

  // user_id → owned slug set. One row per user, so loading the whole table is
  // cheap; per-row tolerance keeps one corrupt inventory from breaking /locks.
  const inventoryByUser = new Map<string, Set<string>>();
  for (const row of inventoryResult.rows) {
    let inv: { user_id: string; game_slugs_json: string[] };
    try {
      inv = parseRow(InventoryRowSchema, row, "user_inventory");
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
      continue;
    }
    inventoryByUser.set(inv.user_id, new Set(inv.game_slugs_json));
  }

  // date_key → raw reaction rows, grouped for the per-night ranking below.
  const reactionsByDate = new Map<string, z.infer<typeof GameRequestRowSchema>[]>();
  for (const r of parseRows(GameRequestRowSchema, reactionsResult.rows, "game_requests")) {
    let arr = reactionsByDate.get(r.date_key);
    if (!arr) {
      arr = [];
      reactionsByDate.set(r.date_key, arr);
    }
    arr.push(r);
  }

  // Build per-date sets we need to derive headcounts:
  //   canByDate / maybeByDate — declared availability
  //   yesByDate / noByDate    — explicit RSVP overrides
  // The N/N badge shown on the calendar cell is "RSVP yes / yes+maybe":
  //   N1 = definite attendees, N2 = definite + tentative.
  const canByDate = new Map<string, Set<string>>();
  const maybeByDate = new Map<string, Set<string>>();
  for (const row of parseRows(
    AvailabilityDayRowSchema,
    availabilityResult.rows,
    "user_availability_days",
  )) {
    const target = row.status === "can" ? canByDate : maybeByDate;
    let s = target.get(row.date_key);
    if (!s) {
      s = new Set();
      target.set(row.date_key, s);
    }
    s.add(row.user_id);
  }
  const yesByDate = new Map<string, Set<string>>();
  const noByDate = new Map<string, Set<string>>();
  const rsvps = parseRows(RsvpRowSchema, rsvpsResult.rows, "rsvps");
  for (const r of rsvps) {
    const map = r.status === "yes" ? yesByDate : noByDate;
    let s = map.get(r.date_key);
    if (!s) {
      s = new Set();
      map.set(r.date_key, s);
    }
    s.add(r.user_id);
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
      hostAtHome: boolean;
      attendance: { definite: number; tentative: number };
      topGameSlug: string | null;
    }
  > = {};
  for (const row of locksResult.rows) {
    // Strict: a malformed lock row is a real problem (admin wrote it),
    // not data degradation we should silently swallow.
    const lock = parseRow(LockedDateRowSchema, row, "locked_dates");
    const hostAtHome = lock.host_at_home === null ? true : lock.host_at_home !== 0;

    const cans = canByDate.get(lock.date_key) ?? new Set<string>();
    const maybes = maybeByDate.get(lock.date_key) ?? new Set<string>();
    const yes = yesByDate.get(lock.date_key) ?? new Set<string>();
    const no = noByDate.get(lock.date_key) ?? new Set<string>();
    // definite = (cans ∪ rsvpYes) − rsvpNo
    const definite = new Set<string>();
    for (const id of cans) if (!no.has(id)) definite.add(id);
    for (const id of yes) if (!no.has(id)) definite.add(id);
    // tentative = maybes − definite − rsvpNo
    let tentativeCount = 0;
    for (const id of maybes) {
      if (!definite.has(id) && !no.has(id)) tentativeCount++;
    }

    // Vote winner for this night, using the same ranking as the per-date
    // games payload (so `topGameSlug` always equals that payload's
    // `topSlugs[0]`). Reactions count from definite attendees only; playable
    // = owned by a definite attendee AND fits the [definite, definite+
    // tentative] window. Drives the calendar's D&D-night card treatment.
    const lo = definite.size;
    const hi = definite.size + tentativeCount;
    const ownedUnion = new Set<string>();
    for (const id of definite) {
      const inv = inventoryByUser.get(id);
      if (inv) for (const slug of inv) ownedUnion.add(slug);
    }
    const dateReactions: Record<string, { hype: number; teach: number; learn: number }> = {};
    for (const r of reactionsByDate.get(lock.date_key) ?? []) {
      if (!definite.has(r.user_id)) continue;
      let agg = dateReactions[r.game_slug];
      if (!agg) {
        agg = { hype: 0, teach: 0, learn: 0 };
        dateReactions[r.game_slug] = agg;
      }
      agg[r.reaction] += 1;
    }
    const topGameSlug =
      rankTopSlugs(dateReactions, computePlayableSlugs(ownedUnion, lo, hi), 1)[0] ?? null;

    out[lock.date_key] = {
      lockedBy: lock.locked_by,
      lockedAt: lock.locked_at,
      expectedUserIds: lock.expected_user_ids_json,
      rsvps: {},
      host: lock.host_user_id ? { userId: lock.host_user_id, name: lock.host_name ?? "" } : null,
      picksLockedAt: lock.picks_locked_at,
      hostAtHome,
      eventTime: lock.event_time,
      address: lock.address,
      attendance: { definite: definite.size, tentative: tentativeCount },
      topGameSlug,
    };
  }
  for (const r of rsvps) {
    const entry = out[r.date_key];
    if (entry) entry.rsvps[r.user_id] = r.status;
  }

  return c.json(CalendarLocksSchema.parse(out));
});

export const adminCalendarLocksRoutes = adminApp();

/** Row projection for the per-host aggregate over locked_dates. */
const HostStatsRowSchema = z.object({
  host_user_id: z.string(),
  total: z.number(),
  last_date: z.string().nullable(),
});

// Per-host aggregate over locked nights — how many a person has hosted and the
// most recent — surfaced in the lock-in host picker so the admin can spread
// hosting around.
adminCalendarLocksRoutes.get("/host-stats", async (c) => {
  const { rows } = await getDb().execute(
    `SELECT host_user_id, COUNT(*) AS total, MAX(date_key) AS last_date
       FROM locked_dates
      WHERE host_user_id IS NOT NULL
      GROUP BY host_user_id`,
  );
  const stats: Record<string, { totalHosts: number; lastHostedDate: string | null }> = {};
  for (const r of parseRows(HostStatsRowSchema, rows, "locked_dates.host-stats")) {
    stats[r.host_user_id] = { totalHosts: r.total, lastHostedDate: r.last_date };
  }
  return c.json(HostStatsMapSchema.parse(stats));
});

adminCalendarLocksRoutes.post("/lock", zJsonBody(LockInRequestBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const date = body.date;
  const hostUserId = body.hostUserId ?? null;
  const hostName = body.hostName ?? null;
  const eventTime = body.eventTime ?? null;
  const address = body.address ?? null;
  // Persist as 0/1/NULL. Undefined/null on the form means "no opinion" → NULL,
  // which the read path normalizes to `true` (legacy behavior). Explicit
  // false is the only way to land in the capped-host branch.
  const hostAtHomeFlag: number | null =
    body.hostAtHome === true ? 1 : body.hostAtHome === false ? 0 : null;

  // Snapshot the set of users who marked can/maybe at lock time so we can
  // decide "fully RSVPed" against a frozen baseline. Track cans separately
  // so we can auto-confirm them as RSVP "yes".
  const [{ rows }, lockRow, { rows: yesRows }] = await Promise.all([
    getDb().execute({
      sql: "SELECT user_id, status FROM user_availability_days WHERE date_key = ?",
      args: [date],
    }),
    getDb().execute({
      sql: "SELECT expected_user_ids_json FROM locked_dates WHERE date_key = ?",
      args: [date],
    }),
    getDb().execute({
      sql: "SELECT user_id FROM rsvps WHERE date_key = ? AND status = 'yes'",
      args: [date],
    }),
  ]);
  // The guest list must never SHRINK on a re-lock. Re-running `/lock` (e.g. to
  // edit host/time/address after the night was already sealed) overwrites this
  // snapshot, so seed it with everyone already committed: the prior `expected`
  // set plus every current `yes` RSVP (the same union `/lock-picks` does). A
  // user who RSVPed yes through the modal without ever marking availability —
  // and is therefore absent from the can/maybe scan below — would otherwise be
  // silently evicted from a sealed night.
  const expectedSet = new Set<string>();
  if (lockRow.rows[0]) {
    try {
      for (const id of parseRow(ExpectedUserIdsRowSchema, lockRow.rows[0], "locked_dates")
        .expected_user_ids_json) {
        expectedSet.add(id);
      }
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
    }
  }
  for (const r of parseRows(RsvpUserIdRowSchema, yesRows, "rsvps")) expectedSet.add(r.user_id);

  const cans: string[] = [];
  for (const row of parseRows(AvailabilityDayForDateRowSchema, rows, "user_availability_days")) {
    if (row.status === "can") {
      expectedSet.add(row.user_id);
      cans.push(row.user_id);
    } else if (row.status === "maybe") {
      expectedSet.add(row.user_id);
    }
  }
  const expected = [...expectedSet];

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
               host_user_id, host_name, event_time, address, host_at_home)
            VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date_key) DO UPDATE SET
              locked_by = excluded.locked_by,
              locked_at = excluded.locked_at,
              expected_user_ids_json = excluded.expected_user_ids_json,
              host_user_id = excluded.host_user_id,
              host_name = excluded.host_name,
              event_time = excluded.event_time,
              address = excluded.address,
              host_at_home = COALESCE(excluded.host_at_home, locked_dates.host_at_home)`,
      args: [
        date,
        user.id,
        JSON.stringify(expected),
        hostUserId,
        hostName,
        eventTime,
        address,
        hostAtHomeFlag,
      ],
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
