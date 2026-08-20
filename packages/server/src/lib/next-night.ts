// "Next board game night this user is attending."
//
// Used by the profile page (single user, enriched with headcount/host via
// `computeAvailableGamesPayload`) and the players directory (every user, date
// only). Attendance mirrors the calendar's model in `available-games.ts`:
//   definite  = availability `can`  OR rsvp `yes`   (and not rsvp `no`)
//   tentative = availability `maybe`                (and not coming/`no`)
// The "next night" is the earliest future locked date (today inclusive) where
// the user is definite or tentative.

import type { Client } from "@libsql/client";
import { z } from "zod";
import {
  type AvailabilityRecord,
  fetchAllAvailabilityDays,
  fetchAvailabilityDaysForUser,
} from "./availability-merge.ts";
import { parseRows } from "./db-rows.ts";

export type NextNightStatus = "definite" | "tentative";
export interface NextNightRef {
  dateKey: string;
  status: NextNightStatus;
}

/**
 * The group's home timezone. Date keys mark calendar days as the group
 * experiences them, so "today" must roll over at midnight in Munich — not at
 * midnight UTC, which is 1-2 hours later and left last night's game night
 * showing as "Next game night" (and excluded from nights-attended) until 1-2am
 * local. The web client already uses browser-local dates, so this also keeps
 * server and client agreeing on what "today" is.
 */
const CALENDAR_TIME_ZONE = process.env.CALENDAR_TIME_ZONE ?? "Europe/Berlin";

// en-CA formats as YYYY-MM-DD — exactly the date-key convention.
const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date key (YYYY-MM-DD) in the group's home timezone. */
export function todayDateKey(now: Date = new Date()): string {
  return dateKeyFormat.format(now);
}

const DateKeyOnlyRowSchema = z.object({ date_key: z.string() });
const RsvpRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
});
const ViewerRsvpRowSchema = z.object({
  date_key: z.string(),
  status: z.enum(["yes", "no"]),
});

/** First date in `futureDates` (ascending) the user is attending, or null. */
function computeNextNight(
  futureDates: readonly string[],
  availability: AvailabilityRecord | undefined,
  rsvpByDate: Map<string, "yes" | "no"> | undefined,
): NextNightRef | null {
  for (const dateKey of futureDates) {
    const rsvp = rsvpByDate?.get(dateKey);
    if (rsvp === "no") continue;
    const avail = availability?.[dateKey];
    if (avail === "can" || rsvp === "yes") return { dateKey, status: "definite" };
    if (avail === "maybe") return { dateKey, status: "tentative" };
  }
  return null;
}

async function loadFutureLockedDates(db: Client, today: string): Promise<string[]> {
  const { rows } = await db.execute({
    sql: "SELECT date_key FROM locked_dates WHERE date_key >= ? AND unlocked_at IS NULL ORDER BY date_key ASC",
    args: [today],
  });
  return parseRows(DateKeyOnlyRowSchema, rows, "locked_dates").map((r) => r.date_key);
}

/** The single user's next night, with their own definite/tentative status. */
export async function findNextNightForUser(
  db: Client,
  userId: string,
  today: string = todayDateKey(),
): Promise<NextNightRef | null> {
  const futureDates = await loadFutureLockedDates(db, today);
  if (futureDates.length === 0) return null;

  const [availability, rsvpResult] = await Promise.all([
    fetchAvailabilityDaysForUser(db, userId),
    db.execute({
      sql: "SELECT date_key, status FROM rsvps WHERE user_id = ? AND date_key >= ?",
      args: [userId, today],
    }),
  ]);

  const rsvpByDate = new Map<string, "yes" | "no">();
  for (const r of parseRows(ViewerRsvpRowSchema, rsvpResult.rows, "rsvps")) {
    rsvpByDate.set(r.date_key, r.status);
  }
  return computeNextNight(futureDates, availability, rsvpByDate);
}

/** Next-night date key for many users at once (directory). Date only. */
export async function findNextNightDateKeysForUsers(
  db: Client,
  userIds: readonly string[],
  today: string = todayDateKey(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const futureDates = await loadFutureLockedDates(db, today);
  if (futureDates.length === 0) return out;

  const wanted = new Set(userIds);
  const rsvpByUser = new Map<string, Map<string, "yes" | "no">>();

  // Only future days can decide a "next night", so the scan is bounded by
  // `today` rather than reading every day anyone has ever marked.
  const [availByUser, rsvpResult] = await Promise.all([
    fetchAllAvailabilityDays(db, { fromDateKey: today }),
    db.execute({
      sql: "SELECT date_key, user_id, status FROM rsvps WHERE date_key >= ?",
      args: [today],
    }),
  ]);

  for (const r of parseRows(RsvpRowSchema, rsvpResult.rows, "rsvps")) {
    if (!wanted.has(r.user_id)) continue;
    let m = rsvpByUser.get(r.user_id);
    if (!m) {
      m = new Map();
      rsvpByUser.set(r.user_id, m);
    }
    m.set(r.date_key, r.status);
  }
  for (const userId of userIds) {
    const ref = computeNextNight(futureDates, availByUser.get(userId), rsvpByUser.get(userId));
    if (ref) out.set(userId, ref.dateKey);
  }
  return out;
}
