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
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";

export const calendarLocksRoutes = authedApp();

calendarLocksRoutes.get("/games", zQuery(AvailableGamesQuerySchema), async (c) => {
  const user = c.get("user");
  const { date } = c.req.valid("query");

  const lockedRow = await getDb().execute({
    sql: "SELECT host_user_id, picks_locked_at FROM locked_dates WHERE date_key = ? LIMIT 1",
    args: [date],
  });
  if (lockedRow.rows.length === 0) {
    return errorResponse(c, 400, "date is not locked");
  }
  const hostUserId = (lockedRow.rows[0].host_user_id as string | null) ?? null;
  const picksLockedAt = (lockedRow.rows[0].picks_locked_at as string | null) ?? null;

  // Compute participant set. `rsvp:no` is an explicit decline — it overrides
  // any availability marker, including an earlier `rsvp:yes`. Only people who
  // are actually coming contribute to the inventory union or to the headcount;
  // a "maybe" who hasn't declined widens the headcount upper bound but never
  // contributes inventory (we can't count on them showing up with the box).
  const [availabilityResult, rsvpResult, reactionResult] = await Promise.all([
    getDb().execute("SELECT user_id, availability_json FROM user_availability"),
    getDb().execute({
      sql: "SELECT user_id, status, auto FROM rsvps WHERE date_key = ?",
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
  // `manuallyRsvpedYes` is the subset of `rsvpYes` that came from a real
  // "Going" button click (auto=0), not the lock-time batch or the modal's
  // first-open useEffect. Drives the "Hasn't RSVP'd yet" pill.
  const manuallyRsvpedYes = new Set<string>();
  for (const row of rsvpResult.rows) {
    const userId = row.user_id as string;
    const status = row.status as string;
    const auto = row.auto as number | null;
    if (status === "yes") {
      rsvpYes.add(userId);
      if (!auto) manuallyRsvpedYes.add(userId);
    } else if (status === "no") {
      rsvpNo.add(userId);
    }
  }

  // Explicit "no" wins over everything else.
  const comingIds = new Set<string>();
  for (const id of canSet) if (!rsvpNo.has(id)) comingIds.add(id);
  for (const id of rsvpYes) if (!rsvpNo.has(id)) comingIds.add(id);
  const definiteIds = [...comingIds];
  const tentativeIds = [...maybeSet].filter((id) => !comingIds.has(id) && !rsvpNo.has(id));

  // Per-user inventory map for definite attendees. Used both for the union
  // (ownedSlugs) and for the bringing assignment downstream.
  const inventoryByUser = new Map<string, Set<string>>();
  const ownedUnion = new Set<string>();
  if (definiteIds.length > 0) {
    const placeholders = definiteIds.map(() => "?").join(",");
    const inventoryResult = await getDb().execute({
      sql: `SELECT user_id, game_slugs_json FROM user_inventory WHERE user_id IN (${placeholders})`,
      args: definiteIds,
    });

    for (const row of inventoryResult.rows) {
      const userId = row.user_id as string;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.game_slugs_json as string);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      const set = new Set<string>();
      for (const slug of parsed) {
        if (typeof slug === "string") {
          set.add(slug);
          ownedUnion.add(slug);
        }
      }
      inventoryByUser.set(userId, set);
    }
  }
  const ownedSlugs = [...ownedUnion].sort();

  type ReactionAggregate = {
    hype: number;
    teach: number;
    learn: number;
    viewer: ("hype" | "teach" | "learn")[];
  };
  const reactions: Record<string, ReactionAggregate> = {};
  // Per-user vote counts used by the Attendees view. Includes definite and
  // tentative voters — a maybe's votes still describe them.
  const votesByUser = new Map<string, { hype: number; teach: number; learn: number }>();
  for (const row of reactionResult.rows) {
    const userId = row.user_id as string;
    const slug = row.game_slug as string;
    const kind = row.reaction as "hype" | "teach" | "learn";
    let agg = reactions[slug];
    if (!agg) {
      agg = { hype: 0, teach: 0, learn: 0, viewer: [] };
      reactions[slug] = agg;
    }
    // Only people who are actually attending influence the leaderboard order.
    // A user who RSVPs "no" after hyping must not still tilt the pick.
    if (comingIds.has(userId)) agg[kind] += 1;
    // The viewer's own reactions stay visible on their buttons either way —
    // local UI state, not a vote.
    if (userId === user.id) agg.viewer.push(kind);
    // Track per-user vote counts (definite + tentative).
    if (comingIds.has(userId) || maybeSet.has(userId)) {
      let v = votesByUser.get(userId);
      if (!v) {
        v = { hype: 0, teach: 0, learn: 0 };
        votesByUser.set(userId, v);
      }
      v[kind] += 1;
    }
  }

  // Top-5 selection. Mirrors RankedGameList's tie-break chain, with a bonus
  // rule: "learn" votes only contribute to the support score when at least one
  // person wants to teach the game. A learner with no teacher is wishful, not
  // actionable, so the game shouldn't gain rank from learn-only votes.
  const ranked = Object.entries(reactions)
    .filter(([, agg]) => agg.hype > 0)
    .sort((a, b) => {
      const aAgg = a[1];
      const bAgg = b[1];
      if (bAgg.hype !== aAgg.hype) return bAgg.hype - aAgg.hype;
      const aLearn = aAgg.teach > 0 ? aAgg.learn : 0;
      const bLearn = bAgg.teach > 0 ? bAgg.learn : 0;
      const aSupport = aAgg.teach + aLearn;
      const bSupport = bAgg.teach + bLearn;
      if (bSupport !== aSupport) return bSupport - aSupport;
      return a[0].localeCompare(b[0]);
    });
  const topSlugs = ranked.slice(0, 5).map(([slug]) => slug);

  // Look up names for everyone in the attendee set (definite + tentative).
  const allAttendeeIds = [...new Set([...definiteIds, ...tentativeIds])];
  const userNames = new Map<string, string>();
  if (allAttendeeIds.length > 0) {
    const placeholders = allAttendeeIds.map(() => "?").join(",");
    const userResult = await getDb().execute({
      sql: `SELECT id, name, email FROM user WHERE id IN (${placeholders})`,
      args: allAttendeeIds,
    });
    for (const row of userResult.rows) {
      const id = row.id as string;
      const raw =
        ((row.name as string | null) || (row.email as string | null) || "—").trim() || "—";
      userNames.set(id, raw);
    }
  }

  // Bringing assignment. Greedy with rarity-first ordering: process the
  // top-5 game with the fewest definite-owners first so we don't orphan it
  // by spending an owner's slot on a more-common game. Host has no per-user
  // limit (they bring everything they own that's in the top 5).
  const PER_NONHOST_LIMIT = 3;
  type DefiniteAttendee = { userId: string; isHost: boolean };
  const definiteAttendees: DefiniteAttendee[] = definiteIds.map((id) => ({
    userId: id,
    isHost: id === hostUserId,
  }));
  const bringing = new Map<string, string[]>();
  for (const a of definiteAttendees) bringing.set(a.userId, []);

  const rarity = (slug: string) =>
    definiteAttendees.filter((a) => inventoryByUser.get(a.userId)?.has(slug)).length;
  const orderedTop = [...topSlugs].sort((a, b) => rarity(a) - rarity(b));

  for (const slug of orderedTop) {
    const owners = definiteAttendees.filter((a) => inventoryByUser.get(a.userId)?.has(slug));
    if (owners.length === 0) continue;
    const hostOwner = owners.find((o) => o.isHost);
    if (hostOwner) {
      // Host owns it — they bring it from their collection. No slot consumed.
      bringing.get(hostOwner.userId)?.push(slug);
      continue;
    }
    const eligible = owners.filter(
      (o) => (bringing.get(o.userId)?.length ?? 0) < PER_NONHOST_LIMIT,
    );
    if (eligible.length === 0) continue;
    eligible.sort((a, b) => {
      const aFree = PER_NONHOST_LIMIT - (bringing.get(a.userId)?.length ?? 0);
      const bFree = PER_NONHOST_LIMIT - (bringing.get(b.userId)?.length ?? 0);
      if (aFree !== bFree) return bFree - aFree;
      // Tie: prefer the owner with fewer top-5 alternatives — picking a
      // less-versatile owner here frees a more-versatile one for later games.
      const aAlts = topSlugs.filter((s) => inventoryByUser.get(a.userId)?.has(s)).length;
      const bAlts = topSlugs.filter((s) => inventoryByUser.get(b.userId)?.has(s)).length;
      return aAlts - bAlts;
    });
    bringing.get(eligible[0].userId)?.push(slug);
  }

  // Build the attendees array (definite first, then tentative). The host
  // always lists every top-5 game they own (their whole collection is at
  // the venue); non-hosts list only the games they were assigned to bring.
  // `hasRsvped` records whether the user has an explicit yes RSVP — false
  // means they're in the list purely from availability and the host should
  // ping them in real life.
  type AttendeeOut = {
    userId: string;
    name: string;
    isHost: boolean;
    status: "definite" | "tentative";
    hasRsvped: boolean;
    votes: { hype: number; teach: number; learn: number };
    bringing: string[];
  };
  const attendees: AttendeeOut[] = [];
  for (const id of definiteIds) {
    const isHost = id === hostUserId;
    const inv = inventoryByUser.get(id);
    const list = isHost ? topSlugs.filter((s) => inv?.has(s)) : (bringing.get(id) ?? []);
    attendees.push({
      userId: id,
      name: userNames.get(id) ?? "—",
      isHost,
      status: "definite",
      hasRsvped: manuallyRsvpedYes.has(id),
      votes: votesByUser.get(id) ?? { hype: 0, teach: 0, learn: 0 },
      bringing: list,
    });
  }
  for (const id of tentativeIds) {
    attendees.push({
      userId: id,
      name: userNames.get(id) ?? "—",
      isHost: id === hostUserId,
      status: "tentative",
      hasRsvped: manuallyRsvpedYes.has(id),
      votes: votesByUser.get(id) ?? { hype: 0, teach: 0, learn: 0 },
      bringing: [],
    });
  }
  attendees.sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.status !== b.status) return a.status === "definite" ? -1 : 1;
    const aTotal = a.votes.hype + a.votes.teach + a.votes.learn;
    const bTotal = b.votes.hype + b.votes.teach + b.votes.learn;
    if (bTotal !== aTotal) return bTotal - aTotal;
    return a.name.localeCompare(b.name);
  });

  return c.json(
    AvailableGamesSchema.parse({
      ownedSlugs,
      definiteCount: definiteIds.length,
      tentativeCount: tentativeIds.length,
      participantIds: definiteIds,
      reactions,
      topSlugs,
      attendees,
      picksLockedAt,
    }),
  );
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

  // Drop only the lock row. RSVPs and reactions stay so an explicit "no" (or
  // a hyped game) survives an unlock + re-lock cycle — otherwise the lock
  // handler's auto-RSVP-yes-for-cans flips a "no" voter back to "yes" without
  // them clicking anything, and their inventory re-enters the games list.
  await getDb().execute({
    sql: "DELETE FROM locked_dates WHERE date_key = ?",
    args: [date],
  });

  return c.json(OkResponseSchema.parse({ ok: true }));
});
