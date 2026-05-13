// Shared computation for the "what's happening on this locked date" payload.
// Both the existing `GET /api/calendar/games` route (auth-routes/calendar-
// locks.ts) and the personal iCalendar feed (auth-routes/calendar-feed-
// public.ts) call this function. Pulling the logic out keeps the bring-
// assignment / top-5 / playable-slugs rules in one place — two copies of
// this would drift within a sprint.
//
// The function returns a richer view than the wire schema: the `wire` field
// is the AvailableGames payload the HTTP route ships, while `viewer` and
// `lock` expose the extras the ICS builder needs (expected-set membership,
// viewer's auto/manual RSVP distinction, viewer's hype presence, raw host
// fields) without leaking them into the public JSON.

import { getBggBySlug, maxPlayersAsNumber } from "@boardgames/core/bgg";
import type { AvailableGames } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";

export type AvailableGamesViewerExtras = {
  /** Viewer is in locked_dates.expected_user_ids_json. */
  inExpectedSet: boolean;
  /** Viewer's current RSVP row, if any. */
  rsvp: "yes" | "no" | undefined;
  /** True only when the rsvp row's auto flag is 0 (real button click). */
  rsvpManual: boolean;
  /** Viewer has cast ≥1 hype reaction for this date. */
  hyped: boolean;
  /** Viewer's bring assignment (subset of topSlugs). Same algorithm the
   *  Attendees view uses; the host's assignment is "every top-5 they own". */
  bringing: string[];
};

export type AvailableGamesLockMeta = {
  hostUserId: string | null;
  hostName: string | null;
  eventTime: string | null;
  address: string | null;
  picksLockedAt: string | null;
  expectedUserIds: string[];
  /** SQLite "YYYY-MM-DD HH:MM:SS" — the lock row's `locked_at`. */
  lockedAt: string;
};

export type AvailableGamesView = {
  wire: AvailableGames;
  viewer: AvailableGamesViewerExtras;
  lock: AvailableGamesLockMeta;
  /**
   * Latest data-freshness timestamp across the lock, its RSVPs, its
   * reactions, and the picks-lock toggle. Drives `DTSTAMP` and
   * `LAST-MODIFIED` so the rendered ICS body stays byte-identical between
   * polls when nothing has actually changed (and 304 fires).
   */
  latestActivityAt: string;
};

/**
 * Compute the full view of a locked game night from the viewer's perspective.
 * Returns null when the date isn't currently locked — the HTTP route turns
 * that into a 400 error envelope; the ICS feed simply omits the event.
 */
export async function computeAvailableGamesPayload(opts: {
  db: Client;
  date: string;
  viewerId: string;
}): Promise<AvailableGamesView | null> {
  const { db, date, viewerId } = opts;

  const lockedRow = await db.execute({
    sql: `SELECT host_user_id, host_name, event_time, address, picks_locked_at,
                 expected_user_ids_json, locked_at
          FROM locked_dates WHERE date_key = ? LIMIT 1`,
    args: [date],
  });
  if (lockedRow.rows.length === 0) return null;
  const lockRow = lockedRow.rows[0];
  if (!lockRow) return null;
  const hostUserId = (lockRow.host_user_id as string | null) ?? null;
  const hostName = (lockRow.host_name as string | null) ?? null;
  const eventTime = (lockRow.event_time as string | null) ?? null;
  const address = (lockRow.address as string | null) ?? null;
  const picksLockedAt = (lockRow.picks_locked_at as string | null) ?? null;
  const expectedUserIds = parseStringArray(lockRow.expected_user_ids_json as string);
  const lockedAt = (lockRow.locked_at as string | null) ?? "1970-01-01 00:00:00";

  // Pull every input the headcount math needs in parallel. We also fetch the
  // MAX(rsvped_at) and MAX(created_at) for this date so the ICS feed can
  // derive a stable DTSTAMP/LAST-MODIFIED without re-scanning these tables.
  const [availabilityResult, rsvpResult, reactionResult, freshnessResult] = await Promise.all([
    db.execute("SELECT user_id, availability_json FROM user_availability"),
    db.execute({
      sql: "SELECT user_id, status, auto FROM rsvps WHERE date_key = ?",
      args: [date],
    }),
    db.execute({
      sql: "SELECT user_id, game_slug, reaction FROM game_requests WHERE date_key = ?",
      args: [date],
    }),
    db.execute({
      sql: `SELECT
              (SELECT MAX(rsvped_at) FROM rsvps WHERE date_key = ?) AS latest_rsvp,
              (SELECT MAX(created_at) FROM game_requests WHERE date_key = ?) AS latest_reaction`,
      args: [date, date],
    }),
  ]);
  const freshness = freshnessResult.rows[0];
  const latestRsvp = (freshness?.latest_rsvp as string | null) ?? null;
  const latestReaction = (freshness?.latest_reaction as string | null) ?? null;
  const latestActivityAt = maxSqliteDatetime([lockedAt, picksLockedAt, latestRsvp, latestReaction]);

  const canSet = new Set<string>();
  const maybeSet = new Set<string>();
  for (const row of availabilityResult.rows) {
    const userId = row.user_id as string;
    const map = parseAvailabilityForDate(row.availability_json as string, date);
    if (map === "can") canSet.add(userId);
    else if (map === "maybe") maybeSet.add(userId);
  }

  const rsvpYes = new Set<string>();
  const rsvpNo = new Set<string>();
  // Subset of rsvpYes that are real button clicks (auto=0), used to derive
  // the "Hasn't RSVP'd yet" pill and the `[RSVP!]` calendar title prefix.
  const manuallyRsvpedYes = new Set<string>();
  let viewerRsvp: "yes" | "no" | undefined;
  let viewerRsvpManual = false;
  for (const row of rsvpResult.rows) {
    const userId = row.user_id as string;
    const status = row.status as string;
    const auto = row.auto as number | null;
    if (status === "yes") {
      rsvpYes.add(userId);
      if (!auto) manuallyRsvpedYes.add(userId);
      if (userId === viewerId) {
        viewerRsvp = "yes";
        viewerRsvpManual = !auto;
      }
    } else if (status === "no") {
      rsvpNo.add(userId);
      if (userId === viewerId) {
        viewerRsvp = "no";
        viewerRsvpManual = true; // a "no" is always a deliberate click
      }
    }
  }

  // Explicit "no" wins over everything else.
  const comingIds = new Set<string>();
  for (const id of canSet) if (!rsvpNo.has(id)) comingIds.add(id);
  for (const id of rsvpYes) if (!rsvpNo.has(id)) comingIds.add(id);
  const definiteIds = [...comingIds];
  const tentativeIds = [...maybeSet].filter((id) => !comingIds.has(id) && !rsvpNo.has(id));

  // Per-user inventory map for definite attendees.
  const inventoryByUser = new Map<string, Set<string>>();
  const ownedUnion = new Set<string>();
  if (definiteIds.length > 0) {
    const placeholders = definiteIds.map(() => "?").join(",");
    const inventoryResult = await db.execute({
      sql: `SELECT user_id, game_slugs_json FROM user_inventory WHERE user_id IN (${placeholders})`,
      args: definiteIds,
    });
    for (const row of inventoryResult.rows) {
      const userId = row.user_id as string;
      const set = parseInventorySet(row.game_slugs_json as string);
      for (const slug of set) ownedUnion.add(slug);
      inventoryByUser.set(userId, set);
    }
  }
  const ownedSlugs = [...ownedUnion].sort();

  // "Playable" = owned AND fits the [definite, definite+tentative] window.
  const lo = definiteIds.length;
  const hi = definiteIds.length + tentativeIds.length;
  const playableSlugs = new Set<string>();
  for (const slug of ownedUnion) {
    const bgg = getBggBySlug(slug);
    const min = bgg?.minPlayers ?? 1;
    const max = maxPlayersAsNumber(bgg?.maxPlayers ?? null);
    if (min <= lo && max >= hi) playableSlugs.add(slug);
  }

  type ReactionAggregate = {
    hype: number;
    teach: number;
    learn: number;
    viewer: ("hype" | "teach" | "learn")[];
  };
  const reactions: Record<string, ReactionAggregate> = {};
  const votesByUser = new Map<string, { hype: number; teach: number; learn: number }>();
  let viewerHyped = false;
  for (const row of reactionResult.rows) {
    const userId = row.user_id as string;
    const slug = row.game_slug as string;
    const kind = row.reaction as "hype" | "teach" | "learn";
    let agg = reactions[slug];
    if (!agg) {
      agg = { hype: 0, teach: 0, learn: 0, viewer: [] };
      reactions[slug] = agg;
    }
    if (comingIds.has(userId)) agg[kind] += 1;
    if (userId === viewerId) {
      agg.viewer.push(kind);
      if (kind === "hype") viewerHyped = true;
    }
    if ((comingIds.has(userId) || maybeSet.has(userId)) && playableSlugs.has(slug)) {
      let v = votesByUser.get(userId);
      if (!v) {
        v = { hype: 0, teach: 0, learn: 0 };
        votesByUser.set(userId, v);
      }
      v[kind] += 1;
    }
  }

  // Top-5 selection: hype first, then teach+learn (learn only counts when at
  // least one teach is present), then slug alphabetical for stability.
  // Unplayable games are filtered out *before* slicing so they never block a
  // slot — the 5th playable hype winner gets the spot instead.
  const ranked = Object.entries(reactions)
    .filter(([slug, agg]) => agg.hype > 0 && playableSlugs.has(slug))
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

  // Resolve display names.
  const allAttendeeIds = [...new Set([...definiteIds, ...tentativeIds])];
  const userNames = new Map<string, string>();
  if (allAttendeeIds.length > 0) {
    const placeholders = allAttendeeIds.map(() => "?").join(",");
    const userResult = await db.execute({
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

  // Bringing assignment. Rarity-first greedy, host has no per-user cap.
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
      const aAlts = topSlugs.filter((s) => inventoryByUser.get(a.userId)?.has(s)).length;
      const bAlts = topSlugs.filter((s) => inventoryByUser.get(b.userId)?.has(s)).length;
      return aAlts - bAlts;
    });
    bringing.get(eligible[0]?.userId ?? "")?.push(slug);
  }

  // Build the attendees array (definite first, then tentative).
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

  // Viewer's own bring list (for the [Bring: …] title prefix).
  const viewerBringingSlugs: string[] = (() => {
    if (!comingIds.has(viewerId)) return [];
    const inv = inventoryByUser.get(viewerId);
    return viewerId === hostUserId
      ? topSlugs.filter((s) => inv?.has(s))
      : (bringing.get(viewerId) ?? []);
  })();

  return {
    wire: {
      ownedSlugs,
      definiteCount: definiteIds.length,
      tentativeCount: tentativeIds.length,
      participantIds: definiteIds,
      reactions,
      topSlugs,
      attendees,
      picksLockedAt,
    },
    viewer: {
      inExpectedSet: expectedUserIds.includes(viewerId),
      rsvp: viewerRsvp,
      rsvpManual: viewerRsvpManual,
      hyped: viewerHyped,
      bringing: viewerBringingSlugs,
    },
    lock: {
      hostUserId,
      hostName,
      eventTime,
      address,
      picksLockedAt,
      expectedUserIds,
      lockedAt,
    },
    latestActivityAt,
  };
}

export type ViewerDateSource = "locked" | "tombstone"; // we want to emit STATUS:CANCELLED for unlocked nights

export type ViewerDateRef = { dateKey: string; source: ViewerDateSource };

/**
 * Enumerate every date the viewer has a relationship with — currently
 * locked or recently unlocked — within the [from, to) window.
 *
 * "Relationship" = the viewer is in `expected_user_ids_json`, OR they have
 * any `rsvps` row for the date, OR they have any `game_requests` row.
 * Filtering down to these dates keeps the feed small and avoids leaking
 * unrelated nights into a stranger's calendar.
 */
export async function listLockedDatesForViewer(opts: {
  db: Client;
  viewerId: string;
  fromInclusive: string;
  toExclusive: string;
  tombstoneCutoff: string;
}): Promise<ViewerDateRef[]> {
  const { db, viewerId, fromInclusive, toExclusive, tombstoneCutoff } = opts;

  // Locked dates the viewer has a relationship with.
  const lockedRows = await db.execute({
    sql: `SELECT DISTINCT ld.date_key
          FROM locked_dates ld
          WHERE ld.date_key >= ? AND ld.date_key < ?
            AND (
                 EXISTS (SELECT 1 FROM rsvps r
                         WHERE r.date_key = ld.date_key AND r.user_id = ?)
              OR EXISTS (SELECT 1 FROM game_requests gr
                         WHERE gr.date_key = ld.date_key AND gr.user_id = ?)
              OR instr(ld.expected_user_ids_json, ?) > 0
            )`,
    args: [fromInclusive, toExclusive, viewerId, viewerId, viewerId],
  });

  // Tombstones for nights the viewer was expected on.
  const tombstoneRows = await db.execute({
    sql: `SELECT date_key
          FROM calendar_unlocked_tombstones
          WHERE date_key >= ? AND date_key < ?
            AND unlocked_at > ?
            AND instr(expected_user_ids_json, ?) > 0`,
    args: [fromInclusive, toExclusive, tombstoneCutoff, viewerId],
  });

  const out: ViewerDateRef[] = [];
  for (const row of lockedRows.rows) {
    out.push({ dateKey: row.date_key as string, source: "locked" });
  }
  for (const row of tombstoneRows.rows) {
    out.push({ dateKey: row.date_key as string, source: "tombstone" });
  }
  return out;
}

export type TombstoneRow = {
  dateKey: string;
  hostUserId: string | null;
  hostName: string | null;
  eventTime: string | null;
  address: string | null;
  expectedUserIds: string[];
  unlockedAt: string;
};

/** Fetch a tombstone row for emitting a STATUS:CANCELLED event. */
export async function getTombstone(db: Client, dateKey: string): Promise<TombstoneRow | null> {
  const { rows } = await db.execute({
    sql: `SELECT date_key, host_user_id, host_name, event_time, address,
                 expected_user_ids_json, unlocked_at
          FROM calendar_unlocked_tombstones WHERE date_key = ? LIMIT 1`,
    args: [dateKey],
  });
  const row = rows[0];
  if (!row) return null;
  return {
    dateKey: row.date_key as string,
    hostUserId: (row.host_user_id as string | null) ?? null,
    hostName: (row.host_name as string | null) ?? null,
    eventTime: (row.event_time as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    expectedUserIds: parseStringArray(row.expected_user_ids_json as string),
    unlockedAt: row.unlocked_at as string,
  };
}

// ── Internal helpers ───────────────────────────────────────────────────

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function parseInventorySet(json: string | null | undefined): Set<string> {
  if (!json) return new Set();
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const s of parsed) if (typeof s === "string") out.add(s);
    return out;
  } catch {
    return new Set();
  }
}

/** Lexicographic max of SQLite "YYYY-MM-DD HH:MM:SS" timestamps; nulls
 *  ignored. Falls back to the unix epoch so the caller always gets a real
 *  string back (downstream serializers don't have to special-case null). */
export function maxSqliteDatetime(stamps: (string | null | undefined)[]): string {
  let max = "1970-01-01 00:00:00";
  for (const s of stamps) {
    if (!s) continue;
    if (s > max) max = s;
  }
  return max;
}

function parseAvailabilityForDate(
  json: string | null | undefined,
  date: string,
): "can" | "maybe" | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const v = (parsed as Record<string, unknown>)[date];
    if (v === "can" || v === "maybe") return v;
    return undefined;
  } catch {
    return undefined;
  }
}
