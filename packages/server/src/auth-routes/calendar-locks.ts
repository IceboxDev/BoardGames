import { expandOwnedSlugs } from "@boardgames/core/games/ownership";
import {
  AdminNightGuestBodySchema,
  AvailableGamesQuerySchema,
  AvailableGamesSchema,
  CalendarLocksSchema,
  GameReactionBodySchema,
  HostStatsMapSchema,
  type LockedDateSchema,
  LockInRequestBodySchema,
  LockInResponseSchema,
  nightDate,
  OkResponseSchema,
  PicksLockBodySchema,
  PrivateNightUpdateBodySchema,
  SlugListSchema,
  UnlockBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp, authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import {
  computeAvailableGamesPayload,
  computePlayableSlugs,
  rankNightLineup,
} from "../lib/available-games.ts";
import { jsonColumn, parseRow, parseRows, RowParseError } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import {
  deriveNightParticipants,
  loadActiveNightLocks,
  loadNightLock,
  sealedAt,
} from "../lib/night-participants.ts";
import { RSVP_NOW } from "./calendar-rsvps.ts";

export const calendarLocksRoutes = authedApp();

// ── Row projections ───────────────────────────────────────────────────
//
// One projection per `SELECT` list. Columns appear in the same order
// here as in the SQL so a column rename in `db.ts` surfaces in this
// file as a diff in the same PR.

/** Stored as a JSON-encoded array of better-auth user ids. */
const ExpectedUserIdsSchema = z.array(z.string());

/** `SELECT expected_user_ids_json FROM locked_dates WHERE date_key = ?`. */
const ExpectedUserIdsRowSchema = z.object({
  expected_user_ids_json: jsonColumn(ExpectedUserIdsSchema),
});

/** `SELECT user_id FROM rsvps WHERE date_key = ? AND status = 'yes'`. */
const RsvpUserIdRowSchema = z.object({ user_id: z.string() });

/** `SELECT user_id, status, rsvped_at FROM rsvps WHERE date_key = ?`. */
const RsvpForDateRowSchema = z.object({
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
  rsvped_at: z.string(),
});

/** `SELECT id FROM "user" WHERE ...`. */
const UserIdRowSchema = z.object({ id: z.string() });

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

/** `SELECT date_key, user_id, status, rsvped_at FROM rsvps`. */
const RsvpRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
  rsvped_at: z.string(),
});

/**
 * `SELECT date_key, user_id, game_slug, reaction, created_at FROM
 *  game_requests` — scoped to locked dates. Feeds the per-night vote-winner
 * (`topGameSlug`); `created_at` is the pick order on host-curated nights.
 */
const GameRequestRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  game_slug: z.string(),
  reaction: z.enum(["hype", "teach", "learn"]),
  created_at: z.string(),
});

/** `SELECT user_id, game_slugs_json FROM user_inventory`. */
const InventoryRowSchema = z.object({
  user_id: z.string(),
  game_slugs_json: jsonColumn(SlugListSchema),
});

// ── Routes ────────────────────────────────────────────────────────────

calendarLocksRoutes.get("/games", zQuery(AvailableGamesQuerySchema), async (c) => {
  const user = c.get("user");
  const { date } = c.req.valid("query");
  const view = await computeAvailableGamesPayload({
    db: getDb(),
    date,
    viewerId: user.id,
    viewerIsAdmin: user.role === "admin",
  });
  if (!view) return errorResponse(c, 400, "date is not locked");
  // A private night's roster, lineup and votes are for its guest list only.
  if (!view.viewer.allowed) {
    return errorResponse(c, 403, "this night is invitation only", "PRIVATE_NIGHT");
  }
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

  const lock = await loadNightLock(getDb(), date);
  if (!lock) {
    return errorResponse(c, 400, "date is not locked");
  }
  const hostUserId = lock.hostUserId;
  const isAdmin = (user as { role?: string }).role === "admin";
  const isHost = hostUserId !== null && hostUserId === user.id;
  if (!isAdmin && !isHost) {
    return errorResponse(c, 403, "only admin or host can toggle picks-lock", "FORBIDDEN");
  }
  // A private night's guest list is the invitation: it is sealed from lock-in
  // and there is no second lock to turn (see `sealedAt`).
  if (lock.isPrivate) {
    return errorResponse(c, 400, "a private night is sealed from lock-in", "NOT_APPLICABLE");
  }

  if (on) {
    // Snapshot the guest list at picks-lock time. The date-lock snapshot was
    // taken when the host first locked the date and only sees users who had
    // marked availability by then — anyone who RSVPed yes later (e.g. via
    // the modal without ever touching the availability calendar) was getting
    // shut out of the modal once picks were locked. Union the original
    // snapshot with every current `yes` RSVP so the guest list at picks-lock
    // time actually reflects who has committed to the night.
    const { rows: yesRows } = await getDb().execute({
      sql: "SELECT user_id FROM rsvps WHERE date_key = ? AND status = 'yes'",
      args: [date],
    });
    const expected = new Set<string>(lock.expectedUserIds);
    for (const r of parseRows(RsvpUserIdRowSchema, yesRows, "rsvps")) expected.add(r.user_id);

    await getDb().execute({
      sql: `UPDATE locked_dates
              SET picks_locked_at = datetime('now'),
                  expected_user_ids_json = ?
            WHERE date_key = ? AND unlocked_at IS NULL`,
      args: [JSON.stringify([...expected]), date],
    });
  } else {
    await getDb().execute({
      sql: "UPDATE locked_dates SET picks_locked_at = NULL WHERE date_key = ? AND unlocked_at IS NULL",
      args: [date],
    });
  }
  logActivity(user.id, "picks-locked", { date, on });
  return c.json(OkResponseSchema.parse({ ok: true }));
});

calendarLocksRoutes.post("/games/reaction", zJsonBody(GameReactionBodySchema), async (c) => {
  const user = c.get("user");
  const { date, slug, reaction, on } = c.req.valid("json");

  const lock = await loadNightLock(getDb(), date);
  if (!lock) {
    return errorResponse(c, 400, "date is not locked");
  }
  // On a private night the lineup belongs to its pickers: the host alone in
  // host-pick mode, the seated players in group mode. (Admins always may.)
  if (lock.isPrivate) {
    const { rows } = await getDb().execute({
      sql: "SELECT user_id, status, rsvped_at FROM rsvps WHERE date_key = ?",
      args: [date],
    });
    const participants = deriveNightParticipants(
      lock,
      parseRows(RsvpForDateRowSchema, rows, "rsvps"),
      [],
    );
    if (!participants.canReact(user.id, (user as { role?: string }).role === "admin")) {
      return errorResponse(c, 403, "only the night's pickers choose games", "CANNOT_REACT");
    }
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

  logActivity(user.id, "game-vote", { date, slug, reaction, on });
  return c.json(OkResponseSchema.parse({ ok: true }));
});

/**
 * Host or admin adjusts a private night after lock-in: seats, how games get
 * picked, the title, and the guest list. Everything lands in one batch.
 * Removing an invitee also drops their RSVP and votes — otherwise the
 * `prior ∪ yes` unions on re-lock would quietly re-seat them.
 */
calendarLocksRoutes.post("/private-night", zJsonBody(PrivateNightUpdateBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const { date } = body;
  const db = getDb();

  const lock = await loadNightLock(db, date);
  if (!lock) return errorResponse(c, 400, "date is not locked");
  if (!lock.isPrivate) return errorResponse(c, 400, "not a private night", "NOT_PRIVATE");
  const isAdmin = (user as { role?: string }).role === "admin";
  if (!isAdmin && user.id !== lock.hostUserId) {
    return errorResponse(c, 403, "only the host or an admin can manage this night", "FORBIDDEN");
  }

  const hostUserId = lock.hostUserId;
  const removals = new Set(body.removeInviteeIds ?? []);
  if (hostUserId && removals.has(hostUserId)) {
    return errorResponse(c, 400, "the host holds seat 1", "HOST_NOT_REMOVABLE");
  }
  const additions = [...new Set(body.addInviteeIds ?? [])].filter(
    (id) => id !== hostUserId && !removals.has(id),
  );

  // Invitees must be real, non-internal accounts (guest stubs are fine —
  // that is how a plus-one gets a seat).
  if (additions.length > 0) {
    const placeholders = additions.map(() => "?").join(",");
    const { rows } = await db.execute({
      sql: `SELECT id FROM "user" WHERE internal = 0 AND id IN (${placeholders})`,
      args: additions,
    });
    const known = new Set(parseRows(UserIdRowSchema, rows, "user").map((r) => r.id));
    const unknown = additions.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return errorResponse(c, 400, `unknown user: ${unknown[0]}`, "UNKNOWN_USER");
    }
  }

  const { rows: rsvpRows } = await db.execute({
    sql: "SELECT user_id, status, rsvped_at FROM rsvps WHERE date_key = ?",
    args: [date],
  });
  const rsvps = parseRows(RsvpForDateRowSchema, rsvpRows, "rsvps");
  const nextExpected = [
    ...lock.expectedUserIds.filter((id) => !removals.has(id)),
    ...additions.filter((id) => !lock.expectedUserIds.includes(id)),
  ];
  if (hostUserId && !nextExpected.includes(hostUserId)) nextExpected.unshift(hostUserId);
  const seatCount = body.seatCount ?? lock.seatCount;
  const pickMode = body.pickMode ?? lock.pickMode;
  const title = body.title === undefined ? lock.title : body.title || null;

  // Seats can't drop below the people already sitting in them; the host
  // kicks first, then shrinks.
  if (body.seatCount !== undefined) {
    const current = deriveNightParticipants(
      { ...lock, expectedUserIds: nextExpected },
      rsvps.filter((r) => !removals.has(r.user_id)),
      [],
    );
    if (body.seatCount < current.seated.length) {
      return errorResponse(
        c,
        400,
        `${current.seated.length} people are already seated — kick someone before lowering the seats`,
        "SEATS_BELOW_SEATED",
      );
    }
  }

  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `UPDATE locked_dates
                SET expected_user_ids_json = ?, seat_count = ?, pick_mode = ?, title = ?
              WHERE date_key = ? AND unlocked_at IS NULL`,
      args: [JSON.stringify(nextExpected), seatCount, pickMode, title, date],
    },
  ];
  const actuallyRemoved = lock.expectedUserIds.filter((id) => removals.has(id));
  for (const id of actuallyRemoved) {
    stmts.push(
      { sql: "DELETE FROM rsvps WHERE date_key = ? AND user_id = ?", args: [date, id] },
      { sql: "DELETE FROM game_requests WHERE date_key = ? AND user_id = ?", args: [date, id] },
      { sql: "DELETE FROM exit_game_votes WHERE date_key = ? AND user_id = ?", args: [date, id] },
    );
  }
  const actuallyAdded = additions.filter((id) => !lock.expectedUserIds.includes(id));
  for (const id of actuallyAdded) {
    // A re-invite greets again.
    stmts.push({
      sql: "DELETE FROM night_invite_seen WHERE date_key = ? AND user_id = ?",
      args: [date, id],
    });
  }
  await db.batch(stmts, "write");

  if (actuallyAdded.length > 0) {
    logActivity(user.id, "night-invited", { date, userIds: actuallyAdded });
  }
  if (actuallyRemoved.length > 0) {
    logActivity(user.id, "night-uninvited", { date, userIds: actuallyRemoved });
  }
  if (body.seatCount !== undefined && body.seatCount !== lock.seatCount) {
    logActivity(user.id, "night-seats", { date, seatCount: body.seatCount });
  }
  if (body.pickMode !== undefined && body.pickMode !== lock.pickMode) {
    logActivity(user.id, "night-pick-mode", { date, pickMode: body.pickMode });
  }
  return c.json(OkResponseSchema.parse({ ok: true }));
});

calendarLocksRoutes.get("/locks", async (c) => {
  const viewer = c.get("user");
  const viewerIsAdmin = viewer.role === "admin";
  const [locks, rsvpsResult, availabilityResult, reactionsResult, inventoryResult] =
    await Promise.all([
      loadActiveNightLocks(getDb()),
      getDb().execute("SELECT date_key, user_id, status, rsvped_at FROM rsvps"),
      // Availability is marked per DAY; a second night on a date (`…_2`)
      // reads the same marks as the first, so the join goes through the
      // calendar date, not the night key.
      getDb().execute(
        "SELECT user_id, date_key, status FROM user_availability_days WHERE date_key IN (SELECT substr(date_key, 1, 10) FROM locked_dates WHERE unlocked_at IS NULL)",
      ),
      // Reactions for locked nights only — feeds each night's vote-winner.
      // Scoped to locked dates so the scan grows with game nights, not with
      // the whole reaction history.
      getDb().execute(
        "SELECT date_key, user_id, game_slug, reaction, created_at FROM game_requests WHERE date_key IN (SELECT date_key FROM locked_dates WHERE unlocked_at IS NULL)",
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
    inventoryByUser.set(inv.user_id, expandOwnedSlugs(new Set(inv.game_slugs_json)));
  }

  // Group every per-date input so each night is derived from its own rows.
  const groupByDate = <T extends { date_key: string }>(rows: T[]): Map<string, T[]> => {
    const out = new Map<string, T[]>();
    for (const r of rows) {
      let arr = out.get(r.date_key);
      if (!arr) {
        arr = [];
        out.set(r.date_key, arr);
      }
      arr.push(r);
    }
    return out;
  };
  const reactionsByDate = groupByDate(
    parseRows(GameRequestRowSchema, reactionsResult.rows, "game_requests"),
  );
  const availabilityByDate = groupByDate(
    parseRows(AvailabilityDayRowSchema, availabilityResult.rows, "user_availability_days"),
  );
  const rsvpsByDate = groupByDate(parseRows(RsvpRowSchema, rsvpsResult.rows, "rsvps"));

  const out: Record<string, z.input<typeof LockedDateSchema>> = {};
  for (const lock of locks.values()) {
    const rsvps = rsvpsByDate.get(lock.dateKey) ?? [];
    const participants = deriveNightParticipants(
      lock,
      rsvps,
      availabilityByDate.get(nightDate(lock.dateKey)) ?? [],
    );

    // Vote winner for this night, using the same lineup rule as the per-date
    // games payload (so `topGameSlug` always equals that payload's
    // `topSlugs[0]`). Playable = owned by a definite attendee AND fits the
    // night's headcount window. Drives the calendar's D&D-night treatment.
    const ownedUnion = new Set<string>();
    for (const id of participants.definite) {
      const inv = inventoryByUser.get(id);
      if (inv) for (const slug of inv) ownedUnion.add(slug);
    }
    const { lo, hi } = participants.window;
    const topGameSlug =
      rankNightLineup(
        {
          pickMode: lock.pickMode,
          isPrivate: lock.isPrivate,
          hostUserId: lock.hostUserId,
          voters: participants.voters,
          playableSlugs: computePlayableSlugs(ownedUnion, lo, hi),
        },
        reactionsByDate.get(lock.dateKey) ?? [],
        1,
      ).topSlugs[0] ?? null;

    const host = lock.hostUserId ? { userId: lock.hostUserId, name: lock.hostName ?? "" } : null;
    const seats = participants.seats;

    // Outsiders to a private night learn only that the date is taken, by
    // whom, and how full it is. Everything else is stripped here — the wire
    // is the boundary, not the UI.
    if (lock.isPrivate && !participants.canView(viewer.id, viewerIsAdmin)) {
      out[lock.dateKey] = {
        lockedBy: lock.lockedBy,
        lockedAt: lock.lockedAt,
        expectedUserIds: [],
        rsvps: {},
        host,
        eventTime: null,
        address: null,
        picksLockedAt: sealedAt(lock),
        hostAtHome: lock.hostAtHome,
        attendance: { definite: seats?.taken ?? 0, tentative: 0 },
        topGameSlug: null,
        isPrivate: true,
        title: null,
        pickMode: lock.pickMode,
        seats,
        seatedUserIds: [],
        waitlistUserIds: [],
        redacted: true,
      };
      continue;
    }

    // A participant sees the guest list's answers. Someone else's "no" is the
    // host's (and the admin's) business; an outsider's stale row from before
    // the night went private is nobody's.
    const viewerManages = viewerIsAdmin || viewer.id === lock.hostUserId;
    const invited = new Set(lock.expectedUserIds);
    const rsvpMap: Record<string, "yes" | "no"> = {};
    for (const r of rsvps) {
      if (lock.isPrivate) {
        if (!invited.has(r.user_id) && r.user_id !== lock.hostUserId) continue;
        if (r.status === "no" && !viewerManages && r.user_id !== viewer.id) continue;
      }
      rsvpMap[r.user_id] = r.status;
    }

    out[lock.dateKey] = {
      lockedBy: lock.lockedBy,
      lockedAt: lock.lockedAt,
      expectedUserIds: lock.expectedUserIds,
      rsvps: rsvpMap,
      host,
      picksLockedAt: sealedAt(lock),
      hostAtHome: lock.hostAtHome,
      eventTime: lock.eventTime,
      address: lock.address,
      attendance: {
        definite: participants.definite.length,
        tentative: participants.tentative.length,
      },
      topGameSlug,
      isPrivate: lock.isPrivate,
      title: lock.title,
      pickMode: lock.pickMode,
      seats,
      seatedUserIds: participants.seated,
      waitlistUserIds: participants.waitlisted,
      redacted: false,
    };
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
      WHERE host_user_id IS NOT NULL AND unlocked_at IS NULL
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
  const isPrivate = body.isPrivate === true;
  // Persist as 0/1/NULL. Undefined/null on the form means "no opinion" → NULL,
  // which the read path normalizes to `true` (legacy behavior). Explicit
  // false is the only way to land in the capped-host branch.
  const hostAtHomeFlag: number | null =
    body.hostAtHome === true ? 1 : body.hostAtHome === false ? 0 : null;

  // Snapshot the set of users who marked can/maybe at lock time so we can
  // decide "fully RSVPed" against a frozen baseline. Track cans separately
  // so we can auto-confirm them as RSVP "yes".
  const [{ rows }, lockRow, { rows: yesRows }] = await Promise.all([
    // Marks are per day: a second night on the date snapshots the same ones.
    getDb().execute({
      sql: "SELECT user_id, status FROM user_availability_days WHERE date_key = ?",
      args: [nightDate(date)],
    }),
    // DELIBERATELY NOT filtered on `unlocked_at IS NULL`, unlike every other
    // read of this table. This is the revive path: re-locking a night that was
    // called off has to see the guest list it had, or the people who had
    // already committed would be dropped on the way back. The upsert below
    // clears the mark.
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
  //
  // A PRIVATE night's guest list is the invitation, so none of that applies:
  // it is host + the invitees the form sent (or, when the form sent none, the
  // list the row already had). Availability marks and stray "yes" rows never
  // make anyone an invitee.
  let priorExpected: string[] = [];
  if (lockRow.rows[0]) {
    try {
      priorExpected = parseRow(
        ExpectedUserIdsRowSchema,
        lockRow.rows[0],
        "locked_dates",
      ).expected_user_ids_json;
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
    }
  }
  const expectedSet = new Set<string>();
  const cans: string[] = [];
  if (isPrivate) {
    if (hostUserId) expectedSet.add(hostUserId);
    for (const id of body.inviteeIds ?? priorExpected) expectedSet.add(id);
  } else {
    for (const id of priorExpected) expectedSet.add(id);
    for (const r of parseRows(RsvpUserIdRowSchema, yesRows, "rsvps")) expectedSet.add(r.user_id);
    for (const row of parseRows(AvailabilityDayForDateRowSchema, rows, "user_availability_days")) {
      if (row.status === "can") {
        expectedSet.add(row.user_id);
        cans.push(row.user_id);
      } else if (row.status === "maybe") {
        expectedSet.add(row.user_id);
      }
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
  //
  // The upsert also clears `unlocked_at`, reviving a soft-unlocked night
  // (migration 0035). Its rsvps, game votes and exit votes were never deleted,
  // so they come back with it — which is the whole point of the mark.
  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO locked_dates
              (date_key, locked_by, locked_at, expected_user_ids_json,
               host_user_id, host_name, event_time, address, host_at_home,
               private, seat_count, pick_mode, title)
            VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date_key) DO UPDATE SET
              locked_by = excluded.locked_by,
              locked_at = excluded.locked_at,
              expected_user_ids_json = excluded.expected_user_ids_json,
              host_user_id = excluded.host_user_id,
              host_name = excluded.host_name,
              event_time = excluded.event_time,
              address = excluded.address,
              host_at_home = COALESCE(excluded.host_at_home, locked_dates.host_at_home),
              private = excluded.private,
              seat_count = excluded.seat_count,
              pick_mode = excluded.pick_mode,
              title = excluded.title,
              unlocked_at = NULL`,
      args: [
        date,
        user.id,
        JSON.stringify(expected),
        hostUserId,
        hostName,
        eventTime,
        address,
        hostAtHomeFlag,
        isPrivate ? 1 : 0,
        isPrivate ? (body.seatCount ?? null) : null,
        body.pickMode ?? "group",
        isPrivate ? body.title || null : null,
      ],
    },
    // Re-locking the same date invalidates any tombstone — the night is
    // back on, so iCalendar subscribers should see a CONFIRMED event with
    // a bumped SEQUENCE rather than a lingering CANCELLED.
    { sql: "DELETE FROM calendar_unlocked_tombstones WHERE date_key = ?", args: [date] },
  ];
  if (isPrivate) {
    // The host holds seat 1 from the start. Anyone NOT on the list — an
    // outsider's "yes" or vote from before the night went private, a
    // removed invitee — loses their rows: the seat queue and the lineup
    // must only ever hold the guest list.
    if (hostUserId) {
      stmts.push({
        sql: `INSERT OR IGNORE INTO rsvps (date_key, user_id, status, rsvped_at, auto)
              VALUES (?, ?, 'yes', datetime('now'), 1)`,
        args: [date, hostUserId],
      });
    }
    const keep = expected.map(() => "?").join(",");
    const notInvited = keep ? `AND user_id NOT IN (${keep})` : "";
    for (const table of ["rsvps", "game_requests", "exit_game_votes"]) {
      stmts.push({
        sql: `DELETE FROM ${table} WHERE date_key = ? ${notInvited}`,
        args: [date, ...expected],
      });
    }
  } else {
    for (const id of cans) {
      stmts.push({
        sql: `INSERT OR IGNORE INTO rsvps (date_key, user_id, status, rsvped_at, auto)
              VALUES (?, ?, 'yes', datetime('now'), 1)`,
        args: [date, id],
      });
    }
  }
  await getDb().batch(stmts, "write");
  logActivity(user.id, "night-locked", {
    date,
    ...(hostName ? { hostName } : {}),
    ...(isPrivate ? { private: true, seatCount: body.seatCount ?? null } : {}),
  });

  return c.json(LockInResponseSchema.parse({ ok: true, expectedUserIds: expected }));
});

adminCalendarLocksRoutes.delete("/lock", zJsonBody(UnlockBodySchema), async (c) => {
  const user = c.get("user");
  const { date } = c.req.valid("json");

  // Unlock MARKS the night; it no longer deletes it (migration 0035).
  //
  // This used to be three deletes, and the last one cascaded into `rsvps`,
  // `game_requests` and `exit_game_votes`. That erased who had committed to the
  // night and every vote cast for it — permanently, with no undo, and with
  // attendance statistics silently rewritten behind it (see
  // `lib/nights-attended.ts`, which reads both tables). Re-locking could not
  // bring any of it back.
  //
  // Setting `unlocked_at` makes the night exactly as invisible as deleting it
  // did — every read that means "is this night on?" filters
  // `unlocked_at IS NULL` — while keeping the rows, so `POST /lock` restores
  // the guest list, the RSVPs and the votes as they stood. The old worry that
  // motivated the deletes (orphan `rsvp.yes` rows bleeding back in as "ghost
  // availability") is handled by that same filter: `availability-merge.ts` only
  // honours RSVPs on nights that are currently locked.
  //
  // The tombstone copy stays: the iCalendar feed needs it to emit
  // STATUS:CANCELLED for ~30 days, because calendar clients only act on what
  // they see and absence doesn't trigger cleanup. It is written BEFORE the mark
  // so it captures the metadata as it stood.
  await getDb().batch(
    [
      {
        sql: `INSERT OR REPLACE INTO calendar_unlocked_tombstones
                (date_key, expected_user_ids_json, host_user_id, host_name,
                 event_time, address, unlocked_at, private, title)
              SELECT date_key, expected_user_ids_json, host_user_id, host_name,
                     event_time, address, datetime('now'), private, title
              FROM locked_dates WHERE date_key = ? AND unlocked_at IS NULL`,
        args: [date],
      },
      {
        sql: `UPDATE locked_dates SET unlocked_at = datetime('now')
              WHERE date_key = ? AND unlocked_at IS NULL`,
        args: [date],
      },
    ],
    "write",
  );
  logActivity(user.id, "night-unlocked", { date });

  return c.json(OkResponseSchema.parse({ ok: true }));
});

// ── Admin: guest players on a night ───────────────────────────────────
//
// Guests are stub accounts (user.guest = 1) that can't sign in, so an admin
// RSVPs on their behalf. Adding upserts an RSVP "yes" — the guest then flows
// through the normal attendee pipeline (attendee list, headcounts,
// nights-attended) with zero special cases. Removing deletes the RSVP row
// outright (not a "no": a guest never RSVPs themselves, so a tombstone "no"
// would only pollute their RSVP-behavior stats). When the picks are already
// locked, the expected snapshot is kept in sync both ways so re-locks and
// sealed-night math see the guest exactly like any committed member.

/** `SELECT guest FROM "user" WHERE id = ?`. */
const UserGuestFlagRowSchema = z.object({
  guest: z.union([z.number(), z.boolean()]).nullable(),
});

adminCalendarLocksRoutes.post("/night-guest", zJsonBody(AdminNightGuestBodySchema), async (c) => {
  const admin = c.get("user");
  const { date, guestUserId, on } = c.req.valid("json");
  const db = getDb();

  const [lock, userResult] = await Promise.all([
    loadNightLock(db, date),
    db.execute({
      sql: `SELECT guest FROM "user" WHERE id = ? LIMIT 1`,
      args: [guestUserId],
    }),
  ]);
  if (!lock) {
    return errorResponse(c, 400, "date is not locked");
  }
  if (userResult.rows.length === 0) {
    return errorResponse(c, 404, "guest user not found", "NOT_FOUND");
  }
  const { guest } = parseRow(UserGuestFlagRowSchema, userResult.rows[0], "user");
  // Only guest stubs ride this route — real members manage their own RSVPs
  // (and get kicked via /rsvp/kick, which leaves an explicit "no").
  if (!guest) {
    return errorResponse(c, 400, "user is not a guest", "NOT_A_GUEST");
  }

  // Keep the expected snapshot in sync when the guest list is sealed — and
  // always on a private night, where the list is the invitation itself.
  const expected = lock.expectedUserIds;
  const syncExpected = lock.picksLockedAt !== null || lock.isPrivate;

  const stmts = [];
  if (on) {
    stmts.push({
      sql: `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto)
              VALUES (?, ?, 'yes', ${RSVP_NOW}, 0)
              ON CONFLICT(date_key, user_id) DO UPDATE SET
                status = 'yes',
                rsvped_at = CASE WHEN rsvps.status = 'yes' THEN rsvps.rsvped_at ELSE excluded.rsvped_at END,
                auto = 0`,
      args: [date, guestUserId],
    });
    if (syncExpected && !expected.includes(guestUserId)) {
      stmts.push({
        sql: "UPDATE locked_dates SET expected_user_ids_json = ? WHERE date_key = ? AND unlocked_at IS NULL",
        args: [JSON.stringify([...expected, guestUserId]), date],
      });
    }
  } else {
    stmts.push({
      sql: "DELETE FROM rsvps WHERE date_key = ? AND user_id = ?",
      args: [date, guestUserId],
    });
    if (expected.includes(guestUserId)) {
      stmts.push({
        sql: "UPDATE locked_dates SET expected_user_ids_json = ? WHERE date_key = ? AND unlocked_at IS NULL",
        args: [JSON.stringify(expected.filter((id) => id !== guestUserId)), date],
      });
    }
  }
  await db.batch(stmts, "write");
  logActivity(admin.id, "night-guest", { date, targetUserId: guestUserId, on });

  return c.json(OkResponseSchema.parse({ ok: true }));
});
