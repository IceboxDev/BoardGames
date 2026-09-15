// "Next board game night this user is attending."
//
// Used by the profile page (single user, enriched with headcount/host via
// `computeAvailableGamesPayload`) and the players directory (every user, date
// only). Attendance mirrors the calendar's model in `available-games.ts`:
//   definite  = availability `can`  OR rsvp `yes`   (and not rsvp `no`)
//   tentative = availability `maybe`                (and not coming/`no`)
// The "next night" is the earliest future locked date (today inclusive) where
// the user is definite or tentative. Private nights follow their seat list
// instead, and are invisible to a viewer who is not on it (§ NextNightViewer).

import type { Client } from "@libsql/client";
import { z } from "zod";
import {
  type AvailabilityRecord,
  fetchAllAvailabilityDays,
  fetchAvailabilityDaysForUser,
} from "./availability-merge.ts";
import { parseRows } from "./db-rows.ts";
import {
  deriveNightParticipants,
  NIGHT_LOCK_COLUMNS,
  type NightLock,
  NightLockRowSchema,
  nightLockFromRow,
} from "./night-participants.ts";

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

const RsvpRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
  rsvped_at: z.string(),
});
type RsvpRow = z.infer<typeof RsvpRowSchema>;

/**
 * Whose eyes the answer is for. A private night exists, for a viewer, only
 * if they are on its guest list (or an admin): the date itself would give
 * away that the profile's owner is attending something invitation-only.
 */
export interface NextNightViewer {
  viewerId: string;
  viewerIsAdmin: boolean;
}

function visibleTo(night: NightLock, viewer: NextNightViewer): boolean {
  if (!night.isPrivate) return true;
  return (
    viewer.viewerIsAdmin ||
    viewer.viewerId === night.hostUserId ||
    night.expectedUserIds.includes(viewer.viewerId)
  );
}

/** First night in `futureNights` (ascending) the user is attending, or null. */
function computeNextNight(
  futureNights: readonly NightLock[],
  userId: string,
  availability: AvailabilityRecord | undefined,
  rsvpsByDate: Map<string, RsvpRow[]>,
  viewer: NextNightViewer,
): NextNightRef | null {
  for (const night of futureNights) {
    if (!visibleTo(night, viewer)) continue;
    const dateKey = night.dateKey;
    const rows = rsvpsByDate.get(dateKey) ?? [];
    if (night.isPrivate) {
      // Availability marks mean nothing on a private night; only the seat
      // list does. Waiting or unanswered still counts as "might be there".
      const seat = deriveNightParticipants(night, rows, []).seatOf(userId);
      if (seat === "host" || seat === "seated") return { dateKey, status: "definite" };
      if (seat === "waitlisted" || seat === "invited") return { dateKey, status: "tentative" };
      continue;
    }
    const rsvp = rows.find((r) => r.user_id === userId)?.status;
    if (rsvp === "no") continue;
    const avail = availability?.[dateKey];
    if (avail === "can" || rsvp === "yes") return { dateKey, status: "definite" };
    if (avail === "maybe") return { dateKey, status: "tentative" };
  }
  return null;
}

async function loadFutureLockedNights(db: Client, today: string): Promise<NightLock[]> {
  const { rows } = await db.execute({
    sql: `SELECT ${NIGHT_LOCK_COLUMNS} FROM locked_dates
          WHERE date_key >= ? AND unlocked_at IS NULL ORDER BY date_key ASC`,
    args: [today],
  });
  return parseRows(NightLockRowSchema, rows, "locked_dates").map(nightLockFromRow);
}

/** Every RSVP on a future date, grouped by date. Bounded by `today`. */
async function loadFutureRsvps(db: Client, today: string): Promise<Map<string, RsvpRow[]>> {
  const { rows } = await db.execute({
    sql: "SELECT date_key, user_id, status, rsvped_at FROM rsvps WHERE date_key >= ?",
    args: [today],
  });
  const out = new Map<string, RsvpRow[]>();
  for (const r of parseRows(RsvpRowSchema, rows, "rsvps")) {
    let list = out.get(r.date_key);
    if (!list) {
      list = [];
      out.set(r.date_key, list);
    }
    list.push(r);
  }
  return out;
}

/** The single user's next night, with their own definite/tentative status. */
export async function findNextNightForUser(
  db: Client,
  userId: string,
  viewer: NextNightViewer,
  today: string = todayDateKey(),
): Promise<NextNightRef | null> {
  const futureNights = await loadFutureLockedNights(db, today);
  if (futureNights.length === 0) return null;

  const [availability, rsvpsByDate] = await Promise.all([
    fetchAvailabilityDaysForUser(db, userId),
    loadFutureRsvps(db, today),
  ]);
  return computeNextNight(futureNights, userId, availability, rsvpsByDate, viewer);
}

/** Next-night date key for many users at once (directory). Date only. */
export async function findNextNightDateKeysForUsers(
  db: Client,
  userIds: readonly string[],
  viewer: NextNightViewer,
  today: string = todayDateKey(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const futureNights = await loadFutureLockedNights(db, today);
  if (futureNights.length === 0) return out;

  // Only future days can decide a "next night", so the scan is bounded by
  // `today` rather than reading every day anyone has ever marked.
  const [availByUser, rsvpsByDate] = await Promise.all([
    fetchAllAvailabilityDays(db, { fromDateKey: today }),
    loadFutureRsvps(db, today),
  ]);

  for (const userId of userIds) {
    const ref = computeNextNight(
      futureNights,
      userId,
      availByUser.get(userId),
      rsvpsByDate,
      viewer,
    );
    if (ref) out.set(userId, ref.dateKey);
  }
  return out;
}
