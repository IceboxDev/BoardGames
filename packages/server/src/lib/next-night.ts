// "Next board game night this user is attending."
//
// Used by the profile page (single user, enriched with headcount/host via
// `computeAvailableGamesPayload`) and the players directory (every user, date
// only). Attendance mirrors the calendar's model in `available-games.ts`:
//   definite  = availability `can`  OR rsvp `yes`   (and not rsvp `no`)
//   tentative = availability `maybe`                (and not coming/`no`)
// The "next night" is the earliest future locked date (today inclusive) where
// the user is definite or tentative.

import { type Availability, AvailabilityMapSchema } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRow, parseRows, RowParseError } from "./db-rows.ts";

export type NextNightStatus = "definite" | "tentative";
export interface NextNightRef {
  dateKey: string;
  status: NextNightStatus;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** Today's date key (YYYY-MM-DD) in UTC — the calendar's date-key convention. */
export function todayDateKey(now: Date = new Date()): string {
  return `${pad(now.getUTCFullYear(), 4)}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

const DateKeyOnlyRowSchema = z.object({ date_key: z.string() });
const AvailabilityRowSchema = z.object({
  user_id: z.string(),
  availability_json: jsonColumn(AvailabilityMapSchema),
});
const ViewerAvailabilityRowSchema = z.object({
  availability_json: jsonColumn(AvailabilityMapSchema),
});
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
  availability: Record<string, Availability> | undefined,
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
    sql: "SELECT date_key FROM locked_dates WHERE date_key >= ? ORDER BY date_key ASC",
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

  const [availResult, rsvpResult] = await Promise.all([
    db.execute({
      sql: "SELECT availability_json FROM user_availability WHERE user_id = ?",
      args: [userId],
    }),
    db.execute({
      sql: "SELECT date_key, status FROM rsvps WHERE user_id = ? AND date_key >= ?",
      args: [userId, today],
    }),
  ]);

  let availability: Record<string, Availability> | undefined;
  if (availResult.rows[0]) {
    try {
      availability = parseRow(
        ViewerAvailabilityRowSchema,
        availResult.rows[0],
        "user_availability",
      ).availability_json;
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
    }
  }
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
  const availByUser = new Map<string, Record<string, Availability>>();
  const rsvpByUser = new Map<string, Map<string, "yes" | "no">>();

  const [availResult, rsvpResult] = await Promise.all([
    db.execute("SELECT user_id, availability_json FROM user_availability"),
    db.execute({
      sql: "SELECT date_key, user_id, status FROM rsvps WHERE date_key >= ?",
      args: [today],
    }),
  ]);

  for (const row of availResult.rows) {
    let parsed: { user_id: string; availability_json: Record<string, Availability> };
    try {
      parsed = parseRow(AvailabilityRowSchema, row, "user_availability");
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
      continue;
    }
    if (wanted.has(parsed.user_id)) availByUser.set(parsed.user_id, parsed.availability_json);
  }
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
