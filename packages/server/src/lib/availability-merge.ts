// Availability rendering treats a `yes` RSVP as an implicit "can" so the
// calendar heat, personal mark, and admin counts stay in sync with the
// game-night-side rule that already unions cans with RSVPs to derive
// `comingIds`. An explicit `maybe` in the availability map is promoted to
// `can` when a yes RSVP exists for that date — committing via the RSVP wins
// over an earlier "maybe" hedge.
//
// Important: the merge only considers RSVPs on *currently-locked* dates.
// RSVP rows are intentionally preserved across an unlock + re-lock cycle
// (so an explicit "no" survives), which means a date that used to be a
// game night can still have a stale `rsvp.yes` row lying around. If we
// blindly merged those, the user's own availability calendar would show
// "can" on a no-longer-locked date and snap back every time they tried to
// clear it via the calendar (the carousel only opens the RSVP modal on
// locked cells — unlocked cells go through availability cycling). The
// `EXISTS (locked_dates)` filter keeps stored availability fully editable
// once the night is unlocked, while still honoring active RSVPs for the
// heat / pie / personal mark on dates that ARE locked.

import type { Client } from "@libsql/client";

export type AvailabilityStatus = "can" | "maybe";
export type AvailabilityRecord = Record<string, AvailabilityStatus>;

export function parseAvailabilityJson(json: string | null | undefined): AvailabilityRecord {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: AvailabilityRecord = {};
  for (const [date, status] of Object.entries(parsed as Record<string, unknown>)) {
    if (status === "can" || status === "maybe") out[date] = status;
  }
  return out;
}

export function mergeRsvpYesIntoAvailability(
  availability: AvailabilityRecord,
  rsvpYesDates: Iterable<string>,
): AvailabilityRecord {
  const merged: AvailabilityRecord = { ...availability };
  for (const date of rsvpYesDates) merged[date] = "can";
  return merged;
}

export async function fetchRsvpYesDatesForUser(db: Client, userId: string): Promise<string[]> {
  const { rows } = await db.execute({
    sql: `SELECT r.date_key FROM rsvps r
          WHERE r.user_id = ? AND r.status = 'yes'
            AND EXISTS (SELECT 1 FROM locked_dates l WHERE l.date_key = r.date_key)`,
    args: [userId],
  });
  return rows.map((r) => r.date_key as string);
}

/** Build a (userId → Set<dateKey>) index of `yes` RSVPs on currently-locked
 *  dates. Used by aggregate endpoints that walk every user's availability and
 *  need to union RSVP-yes per user without N+1 queries. */
export async function fetchAllRsvpYesByUser(db: Client): Promise<Map<string, Set<string>>> {
  const { rows } = await db.execute(
    `SELECT r.user_id, r.date_key FROM rsvps r
     WHERE r.status = 'yes'
       AND EXISTS (SELECT 1 FROM locked_dates l WHERE l.date_key = r.date_key)`,
  );
  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    const userId = row.user_id as string;
    const date = row.date_key as string;
    let set = out.get(userId);
    if (!set) {
      set = new Set();
      out.set(userId, set);
    }
    set.add(date);
  }
  return out;
}
