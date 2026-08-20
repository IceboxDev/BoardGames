// Profile insight endpoints — the pre-derived data behind the per-player
// match-history (`/u/:userId/matches`) and attendance (`/u/:userId/nights`)
// pages. Mounted on `/api/profiles` beside `profile.ts`, riding the same
// requireAuth + requireOffline umbrella.
//
// Both responses are unpaginated on purpose: a personal history is tiny and
// every infographic (streaks, month buckets, co-player counts, filters) needs
// the full series, so the server derives once — with the SAME helpers the
// profile stats use — and the client slices locally.

import { nightAwareDisplayOrder } from "@boardgames/core/history/display-order";
import {
  extractParticipantIds,
  freeForAllPlacement,
  lastStandingPlacement,
} from "@boardgames/core/history/participant-results";
import { lowScoreWinsForSlug } from "@boardgames/core/history/score-config";
import {
  type ProfileMatchSummaryItem,
  ProfileMatchSummaryResponseSchema,
  type ProfileNightItem,
  ProfileNightsResponseSchema,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse } from "../lib/error-response.ts";
import { userMatchesQuery } from "../lib/match-participants.ts";
import { groupMatchUnits, unitResult } from "../lib/match-units.ts";
import { todayDateKey } from "../lib/next-night.ts";
import { attributeNightsAttended } from "../lib/nights-attended.ts";
import { MatchResultRowSchema } from "./match-history.ts";

export const profileInsightsRoutes = authedApp();

// ── Row projections ────────────────────────────────────────────────────

/** `SELECT id, name, image FROM "user" WHERE id IN (...)`. */
const UserInfoRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

/** Past `locked_dates` projection for the nights endpoint. */
const PastNightRowSchema = z.object({
  date_key: z.string(),
  host_user_id: z.string().nullable(),
  host_name: z.string().nullable(),
  event_time: z.string().nullable(),
  address: z.string().nullable(),
});

/** `SELECT date_key, status, auto FROM rsvps WHERE user_id = ?`. */
const UserRsvpRowSchema = z.object({
  date_key: z.string(),
  status: z.enum(["yes", "no"]),
  auto: z.number(),
});

/** Grouped `COUNT(*)` per night (total matches / user's matches). */
const NightCountRowSchema = z.object({
  date_key: z.string(),
  n: z.number(),
});

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * `{name, image}` for a set of user ids in one round-trip. Sibling of
 * `fetchNameMap` (match-history.ts), which the display-name refresh keeps
 * name-only; the insight payloads also want avatars.
 */
async function fetchPlayerInfoMap(
  db: Client,
  ids: Set<string>,
): Promise<Map<string, { name: string; image: string | null }>> {
  if (ids.size === 0) return new Map();
  const list = [...ids];
  const placeholders = list.map(() => "?").join(",");
  const { rows } = await db.execute({
    sql: `SELECT id, name, image FROM user WHERE id IN (${placeholders})`,
    args: list,
  });
  const parsed = parseRows(UserInfoRowSchema, rows, "user.id-name-image");
  return new Map(parsed.map((r) => [r.id, { name: r.name, image: r.image }]));
}

async function userExists(db: Client, userId: string): Promise<boolean> {
  const { rows } = await db.execute({
    sql: `SELECT 1 FROM "user" WHERE id = ? LIMIT 1`,
    args: [userId],
  });
  return rows.length > 0;
}

// ── GET /api/profiles/:userId/match-summary ────────────────────────────

profileInsightsRoutes.get("/:userId/match-summary", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb();

  const [exists, matchResult] = await Promise.all([
    userExists(db, userId),
    // Unbounded by design — the summary aggregates the whole history.
    db.execute(userMatchesQuery({ userId })),
  ]);
  if (!exists) return errorResponse(c, 404, "user not found", "NOT_FOUND");

  // The query returns played_at order; re-sort to the curated display order
  // (per-night sortOrder) BEFORE grouping, so the timeline agrees with the
  // global history page and campaign units take their first display position.
  const rows = nightAwareDisplayOrder(
    parseRows(MatchResultRowSchema, matchResult.rows, "match_results"),
    (r) => ({ dateKey: r.date_key, playedAt: r.played_at, sortOrder: r.sort_order, id: r.id }),
  );
  const units = groupMatchUnits(rows);

  const items: ProfileMatchSummaryItem[] = [];
  const coIds = new Set<string>();
  for (const unit of units) {
    const r = unit.rep;
    const o = r.outcome_json;
    const lowestWins = lowScoreWinsForSlug(r.game_slug);
    const { result, credit } = unitResult(o, userId, lowestWins, r.game_slug);
    // The participant index guarantees membership, so a null result would mean
    // a desynced index row — skip it rather than fail the whole page.
    if (result === null) continue;

    let placement: { place: number; total: number } | null = null;
    if (o.kind === "free-for-all" && !o.draw) {
      placement = freeForAllPlacement(o, userId, lowestWins);
    } else if (o.kind === "last-standing") {
      placement = lastStandingPlacement(o, userId);
    }
    const score =
      o.kind === "coop" && o.outcome === undefined && o.score !== undefined ? o.score : null;

    const coPlayerIds = extractParticipantIds(o).filter((id) => id !== userId);
    for (const id of coPlayerIds) coIds.add(id);

    items.push({
      matchId: r.id,
      dateKey: r.date_key,
      playedAt: r.played_at,
      gameSlug: r.game_slug,
      gameTitle: r.game_title,
      kind: o.kind,
      result,
      credit,
      place: placement?.place ?? null,
      fieldSize: placement?.total ?? null,
      score,
      sessions: unit.sessions,
      coPlayerIds,
    });
  }

  const infoById = await fetchPlayerInfoMap(db, coIds);
  const players = Object.fromEntries(infoById);

  return c.json(ProfileMatchSummaryResponseSchema.parse({ items, players }));
});

// ── GET /api/profiles/:userId/nights ───────────────────────────────────

profileInsightsRoutes.get("/:userId/nights", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb();
  const today = todayDateKey();

  const [exists, nightsResult, rsvpResult, totalsResult, playedResult] = await Promise.all([
    userExists(db, userId),
    db.execute({
      sql: `SELECT date_key, host_user_id, host_name, event_time, address
              FROM locked_dates WHERE date_key < ? AND unlocked_at IS NULL
             ORDER BY date_key DESC`,
      args: [today],
    }),
    db.execute({
      sql: "SELECT date_key, status, auto FROM rsvps WHERE user_id = ?",
      args: [userId],
    }),
    db.execute(
      `SELECT date_key, COUNT(*) AS n FROM match_results
        WHERE date_key IS NOT NULL GROUP BY date_key`,
    ),
    db.execute({
      sql: `SELECT m.date_key AS date_key, COUNT(*) AS n
              FROM match_results m
              JOIN match_participants p ON p.match_id = m.id
             WHERE p.user_id = ? AND m.date_key IS NOT NULL
             GROUP BY m.date_key`,
      args: [userId],
    }),
  ]);
  if (!exists) return errorResponse(c, 404, "user not found", "NOT_FOUND");

  const nights = parseRows(PastNightRowSchema, nightsResult.rows, "locked_dates");
  const rsvpByNight = new Map(
    parseRows(UserRsvpRowSchema, rsvpResult.rows, "rsvps").map((r) => [r.date_key, r]),
  );
  const totalByNight = new Map(
    parseRows(NightCountRowSchema, totalsResult.rows, "match_results.totals").map((r) => [
      r.date_key,
      r.n,
    ]),
  );
  const playedByNight = new Map(
    parseRows(NightCountRowSchema, playedResult.rows, "match_results.played").map((r) => [
      r.date_key,
      r.n,
    ]),
  );

  const attribution = attributeNightsAttended({
    pastNights: nights.map((n) => n.date_key),
    rsvpYesNights: new Set(
      [...rsvpByNight.values()].filter((r) => r.status === "yes").map((r) => r.date_key),
    ),
    nightsWithMatches: new Set(totalByNight.keys()),
    playedNights: new Set(playedByNight.keys()),
  });

  // Hosts recorded by user id but without a name snapshot need a lookup.
  const hostIdsNeedingName = new Set(
    nights
      .filter((n) => n.host_user_id !== null && n.host_name === null)
      .map((n) => n.host_user_id as string),
  );
  const hostInfo = await fetchPlayerInfoMap(db, hostIdsNeedingName);

  const items: ProfileNightItem[] = nights.map((n) => {
    const via = attribution.get(n.date_key) ?? null;
    const rsvp = rsvpByNight.get(n.date_key);
    const hostName = n.host_name ?? (n.host_user_id ? hostInfo.get(n.host_user_id)?.name : null);
    return {
      dateKey: n.date_key,
      host: hostName ? { userId: n.host_user_id, name: hostName } : null,
      address: n.address,
      eventTime: n.event_time,
      attended: via !== null,
      attendedVia: via,
      rsvp: rsvp?.status ?? null,
      rsvpAuto: rsvp ? rsvp.auto === 1 : null,
      matchesPlayedByUser: playedByNight.get(n.date_key) ?? 0,
      totalMatches: totalByNight.get(n.date_key) ?? 0,
    };
  });

  return c.json(ProfileNightsResponseSchema.parse({ items }));
});
