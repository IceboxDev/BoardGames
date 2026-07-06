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
import { type AvailableGames, SlugListSchema } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRow, parseRows, RowParseError } from "./db-rows.ts";

// ── Row projections ───────────────────────────────────────────────────
//
// One schema per `SELECT` projection. Column order mirrors the SQL so a
// rename in db.ts surfaces as a diff in this file's PR.

const ExpectedUserIdsSchema = z.array(z.string());

/**
 * `SELECT host_user_id, host_name, event_time, address, picks_locked_at,
 *  expected_user_ids_json, locked_at, host_at_home FROM locked_dates`.
 */
const LockedDateFullRowSchema = z.object({
  host_user_id: z.string().nullable(),
  host_name: z.string().nullable(),
  event_time: z.string().nullable(),
  address: z.string().nullable(),
  picks_locked_at: z.string().nullable(),
  expected_user_ids_json: jsonColumn(ExpectedUserIdsSchema),
  locked_at: z.string().nullable(),
  host_at_home: z.number().nullable(),
});

/** `SELECT user_id, status FROM user_availability_days WHERE date_key = ?`.
 *  Normalized per-date rows (migration 0010) — an indexed seek instead of the
 *  old full JSON-blob scan. */
const AvailabilityDayRowSchema = z.object({
  user_id: z.string(),
  status: z.enum(["can", "maybe"]),
});

/** `SELECT user_id, status, auto FROM rsvps WHERE date_key = ?`. */
const RsvpForDateRowSchema = z.object({
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
  auto: z.number().nullable(),
});

/** `SELECT user_id, game_slug, reaction FROM game_requests WHERE date_key = ?`. */
const ReactionRowSchema = z.object({
  user_id: z.string(),
  game_slug: z.string(),
  reaction: z.enum(["hype", "teach", "learn"]),
});

/**
 * `SELECT (MAX(rsvped_at)) AS latest_rsvp, (MAX(created_at)) AS latest_reaction`.
 * Both are nullable because either table can be empty for the date.
 */
const FreshnessRowSchema = z.object({
  latest_rsvp: z.string().nullable(),
  latest_reaction: z.string().nullable(),
});

/** `SELECT user_id, game_slugs_json FROM user_inventory WHERE user_id IN (...)`. */
const UserInventoryRowSchema = z.object({
  user_id: z.string(),
  game_slugs_json: jsonColumn(SlugListSchema),
});

/** `SELECT id, name, email, role FROM user WHERE id IN (...)`. */
const UserDisplayRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  role: z.string().nullable(),
});

/** Single-column `SELECT date_key FROM …` projection. */
const DateKeyOnlyRowSchema = z.object({ date_key: z.string() });

/**
 * `SELECT date_key, host_user_id, host_name, event_time, address,
 *  expected_user_ids_json, unlocked_at FROM calendar_unlocked_tombstones`.
 */
const TombstoneFullRowSchema = z.object({
  date_key: z.string(),
  host_user_id: z.string().nullable(),
  host_name: z.string().nullable(),
  event_time: z.string().nullable(),
  address: z.string().nullable(),
  expected_user_ids_json: jsonColumn(ExpectedUserIdsSchema),
  unlocked_at: z.string(),
});

// ── Types ─────────────────────────────────────────────────────────────

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
  /**
   * Whether the host's collection is on-site. NULL in the DB (legacy rows) is
   * normalized to `true` here so historical nights keep their uncapped-host
   * bringing behavior. New nights store an explicit 0/1.
   */
  hostAtHome: boolean;
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
 * "Playable" = a slug owned by ≥1 confirmed attendee AND whose BGG player
 * range covers the whole [lo, hi] headcount window. Shared by the per-date
 * games payload below and the calendar `/locks` top-game computation so the
 * playability rule lives in exactly one place. Games with no BGG entry
 * (homebrew, bggId 0 — e.g. Dungeons & Dragons before its synthetic snapshot)
 * default to min 1 / max ∞ so they always fit.
 */
export function computePlayableSlugs(
  ownedSlugs: Iterable<string>,
  lo: number,
  hi: number,
): Set<string> {
  const playable = new Set<string>();
  for (const slug of ownedSlugs) {
    const bgg = getBggBySlug(slug);
    const min = bgg?.minPlayers ?? 1;
    const max = maxPlayersAsNumber(bgg?.maxPlayers ?? null);
    if (min <= lo && max >= hi) playable.add(slug);
  }
  return playable;
}

type RankableReaction = { hype: number; teach: number; learn: number };

/**
 * Rank playable, hyped games into an ordered slug list. Hype first, then
 * teach+learn support (learn only counts toward support when ≥1 teach is
 * present — a learner with no teacher is wishful, not actionable), then slug
 * alphabetical for a stable tiebreak. Unplayable games are filtered out
 * *before* slicing so they never block a slot. This is the single source of
 * truth for both the modal's `topSlugs` and the calendar's per-night
 * `topGameSlug`.
 */
export function rankTopSlugs(
  reactions: Record<string, RankableReaction>,
  playableSlugs: Set<string>,
  limit = 5,
): string[] {
  return Object.entries(reactions)
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
    })
    .slice(0, limit)
    .map(([slug]) => slug);
}

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
                 expected_user_ids_json, locked_at, host_at_home
          FROM locked_dates WHERE date_key = ? LIMIT 1`,
    args: [date],
  });
  if (lockedRow.rows.length === 0) return null;
  const lock = parseRow(LockedDateFullRowSchema, lockedRow.rows[0], "locked_dates");
  const hostUserId = lock.host_user_id;
  const hostName = lock.host_name;
  const eventTime = lock.event_time;
  const address = lock.address;
  const picksLockedAt = lock.picks_locked_at;
  const expectedUserIds = lock.expected_user_ids_json;
  const lockedAt = lock.locked_at ?? "1970-01-01 00:00:00";
  // NULL → legacy → treat as at-home (uncapped host bring list, current behavior).
  const hostAtHome = lock.host_at_home === null ? true : lock.host_at_home !== 0;

  // Pull every input the headcount math needs in parallel. We also fetch the
  // MAX(rsvped_at) and MAX(created_at) for this date so the ICS feed can
  // derive a stable DTSTAMP/LAST-MODIFIED without re-scanning these tables.
  const [availabilityResult, rsvpResult, reactionResult, freshnessResult] = await Promise.all([
    db.execute({
      sql: "SELECT user_id, status FROM user_availability_days WHERE date_key = ?",
      args: [date],
    }),
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
  const freshness = freshnessResult.rows[0]
    ? parseRow(FreshnessRowSchema, freshnessResult.rows[0], "rsvps+game_requests.max")
    : { latest_rsvp: null, latest_reaction: null };
  const latestActivityAt = maxSqliteDatetime([
    lockedAt,
    picksLockedAt,
    freshness.latest_rsvp,
    freshness.latest_reaction,
  ]);

  const canSet = new Set<string>();
  const maybeSet = new Set<string>();
  for (const row of parseRows(
    AvailabilityDayRowSchema,
    availabilityResult.rows,
    "user_availability_days",
  )) {
    if (row.status === "can") canSet.add(row.user_id);
    else if (row.status === "maybe") maybeSet.add(row.user_id);
  }

  const rsvpYes = new Set<string>();
  const rsvpNo = new Set<string>();
  // Subset of rsvpYes that are real button clicks (auto=0), used to derive
  // the "Hasn't RSVP'd yet" pill and the `[RSVP!]` calendar title prefix.
  const manuallyRsvpedYes = new Set<string>();
  let viewerRsvp: "yes" | "no" | undefined;
  let viewerRsvpManual = false;
  for (const r of parseRows(RsvpForDateRowSchema, rsvpResult.rows, "rsvps")) {
    if (r.status === "yes") {
      rsvpYes.add(r.user_id);
      if (!r.auto) manuallyRsvpedYes.add(r.user_id);
      if (r.user_id === viewerId) {
        viewerRsvp = "yes";
        viewerRsvpManual = !r.auto;
      }
    } else {
      rsvpNo.add(r.user_id);
      if (r.user_id === viewerId) {
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
      // Per-row tolerance: one user's corrupt inventory doesn't break the
      // whole night's "what's owned" math.
      let inv: { user_id: string; game_slugs_json: string[] };
      try {
        inv = parseRow(UserInventoryRowSchema, row, "user_inventory");
      } catch (err) {
        if (!(err instanceof RowParseError)) throw err;
        continue;
      }
      const set = new Set(inv.game_slugs_json);
      for (const slug of set) ownedUnion.add(slug);
      inventoryByUser.set(inv.user_id, set);
    }
  }
  const ownedSlugs = [...ownedUnion].sort();

  // "Playable" = owned AND fits the [definite, definite+tentative] window.
  const lo = definiteIds.length;
  const hi = definiteIds.length + tentativeIds.length;
  const playableSlugs = computePlayableSlugs(ownedUnion, lo, hi);

  type ReactionAggregate = {
    hype: number;
    teach: number;
    learn: number;
    viewer: ("hype" | "teach" | "learn")[];
  };
  const reactions: Record<string, ReactionAggregate> = {};
  const votesByUser = new Map<string, { hype: number; teach: number; learn: number }>();
  let viewerHyped = false;
  for (const r of parseRows(ReactionRowSchema, reactionResult.rows, "game_requests")) {
    let agg = reactions[r.game_slug];
    if (!agg) {
      agg = { hype: 0, teach: 0, learn: 0, viewer: [] };
      reactions[r.game_slug] = agg;
    }
    if (comingIds.has(r.user_id)) agg[r.reaction] += 1;
    if (r.user_id === viewerId) {
      agg.viewer.push(r.reaction);
      if (r.reaction === "hype") viewerHyped = true;
    }
    if ((comingIds.has(r.user_id) || maybeSet.has(r.user_id)) && playableSlugs.has(r.game_slug)) {
      let v = votesByUser.get(r.user_id);
      if (!v) {
        v = { hype: 0, teach: 0, learn: 0 };
        votesByUser.set(r.user_id, v);
      }
      v[r.reaction] += 1;
    }
  }

  // Top-5 selection — shared ranking (hype → support → slug). See `rankTopSlugs`.
  const topSlugs = rankTopSlugs(reactions, playableSlugs, 5);

  // Resolve display names.
  const allAttendeeIds = [...new Set([...definiteIds, ...tentativeIds])];
  const userNames = new Map<string, string>();
  const adminIds = new Set<string>();
  if (allAttendeeIds.length > 0) {
    const placeholders = allAttendeeIds.map(() => "?").join(",");
    const userResult = await db.execute({
      sql: `SELECT id, name, email, role FROM user WHERE id IN (${placeholders})`,
      args: allAttendeeIds,
    });
    for (const u of parseRows(UserDisplayRowSchema, userResult.rows, "user")) {
      const raw = ((u.name ?? "") || (u.email ?? "") || "—").trim() || "—";
      userNames.set(u.id, raw);
      if (u.role === "admin") adminIds.add(u.id);
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
    // Host fast-path applies only when the host's collection is on-site. If
    // the night is being hosted externally, the host is just another owner
    // and gets the same 3-game cap as everyone else.
    const hostOwner = hostAtHome ? owners.find((o) => o.isHost) : undefined;
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
    isAdmin: boolean;
    status: "definite" | "tentative";
    hasRsvped: boolean;
    votes: { hype: number; teach: number; learn: number };
    bringing: string[];
  };
  const attendees: AttendeeOut[] = [];
  for (const id of definiteIds) {
    const isHost = id === hostUserId;
    const inv = inventoryByUser.get(id);
    // External-host nights bypass the "host shows up with everything" shortcut
    // — they get whatever the capped greedy pass assigned them.
    const list =
      isHost && hostAtHome ? topSlugs.filter((s) => inv?.has(s)) : (bringing.get(id) ?? []);
    attendees.push({
      userId: id,
      name: userNames.get(id) ?? "—",
      isHost,
      isAdmin: adminIds.has(id),
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
      isAdmin: adminIds.has(id),
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
    return viewerId === hostUserId && hostAtHome
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
      hostAtHome,
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
  for (const r of parseRows(DateKeyOnlyRowSchema, lockedRows.rows, "locked_dates")) {
    out.push({ dateKey: r.date_key, source: "locked" });
  }
  for (const r of parseRows(
    DateKeyOnlyRowSchema,
    tombstoneRows.rows,
    "calendar_unlocked_tombstones",
  )) {
    out.push({ dateKey: r.date_key, source: "tombstone" });
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
  const t = parseRow(TombstoneFullRowSchema, row, "calendar_unlocked_tombstones");
  return {
    dateKey: t.date_key,
    hostUserId: t.host_user_id,
    hostName: t.host_name,
    eventTime: t.event_time,
    address: t.address,
    expectedUserIds: t.expected_user_ids_json,
    unlockedAt: t.unlocked_at,
  };
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
