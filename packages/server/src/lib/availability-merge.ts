// Availability rendering treats a `yes` RSVP as an implicit "can" so the
// calendar heat, personal mark, and admin counts stay in sync with the
// game-night-side rule that already unions cans with RSVPs to derive
// `comingIds`. An explicit `maybe` in the availability map is promoted to
// `can` when a yes RSVP exists for that date — committing via the RSVP wins
// over an earlier "maybe" hedge. Symmetrically, an explicit `no` RSVP
// removes any stored can/maybe for that date — the user has just told us
// they aren't coming, so the standing "I could" mark should not keep
// counting toward heat, pie, or admin coverage.
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

import { AvailabilitySchema } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";

export type AvailabilityStatus = "can" | "maybe";
export type AvailabilityRecord = Record<string, AvailabilityStatus>;

/**
 * Parse a stored `availability_json` blob into a typed map, dropping any
 * entries whose status isn't a valid `AvailabilitySchema` member.
 *
 * Per-entry leniency is preserved on purpose: an old/garbled status value
 * for one date shouldn't prevent the user's other dates from rendering.
 * Strict whole-blob validation would also break legacy rows on schema
 * extensions — using per-entry safeParse lets new statuses roll out
 * without retroactively invalidating stored data.
 */
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
  for (const [date, raw] of Object.entries(parsed as Record<string, unknown>)) {
    const status = AvailabilitySchema.safeParse(raw);
    if (status.success) out[date] = status.data;
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

export function applyRsvpNoToAvailability(
  availability: AvailabilityRecord,
  rsvpNoDates: Iterable<string>,
): AvailabilityRecord {
  const merged: AvailabilityRecord = { ...availability };
  for (const date of rsvpNoDates) delete merged[date];
  return merged;
}

// ── Row projections ───────────────────────────────────────────────────

/** `SELECT date_key FROM rsvps WHERE user_id = ? AND status = ?`. */
const DateKeyRowSchema = z.object({ date_key: z.string() });

/** `SELECT user_id, date_key FROM rsvps WHERE status = ?`. */
const UserDateRowSchema = z.object({ user_id: z.string(), date_key: z.string() });

// ── Queries ───────────────────────────────────────────────────────────

export async function fetchRsvpYesDatesForUser(db: Client, userId: string): Promise<string[]> {
  return fetchRsvpDatesForUser(db, userId, "yes");
}

export async function fetchRsvpNoDatesForUser(db: Client, userId: string): Promise<string[]> {
  return fetchRsvpDatesForUser(db, userId, "no");
}

async function fetchRsvpDatesForUser(
  db: Client,
  userId: string,
  status: "yes" | "no",
): Promise<string[]> {
  const { rows } = await db.execute({
    sql: `SELECT r.date_key FROM rsvps r
          WHERE r.user_id = ? AND r.status = ?
            AND EXISTS (SELECT 1 FROM locked_dates l WHERE l.date_key = r.date_key)`,
    args: [userId, status],
  });
  return parseRows(DateKeyRowSchema, rows, "rsvps").map((r) => r.date_key);
}

/** Build a (userId → Set<dateKey>) index of `yes` RSVPs on currently-locked
 *  dates. Used by aggregate endpoints that walk every user's availability and
 *  need to union RSVP-yes per user without N+1 queries. */
export async function fetchAllRsvpYesByUser(db: Client): Promise<Map<string, Set<string>>> {
  return fetchAllRsvpByUser(db, "yes");
}

/** Build a (userId → Set<dateKey>) index of `no` RSVPs on currently-locked
 *  dates. Aggregate endpoints subtract these from can/maybe sets so that an
 *  RSVP-no consistently overrides any stored availability for that date. */
export async function fetchAllRsvpNoByUser(db: Client): Promise<Map<string, Set<string>>> {
  return fetchAllRsvpByUser(db, "no");
}

async function fetchAllRsvpByUser(
  db: Client,
  status: "yes" | "no",
): Promise<Map<string, Set<string>>> {
  const { rows } = await db.execute({
    sql: `SELECT r.user_id, r.date_key FROM rsvps r
          WHERE r.status = ?
            AND EXISTS (SELECT 1 FROM locked_dates l WHERE l.date_key = r.date_key)`,
    args: [status],
  });
  const out = new Map<string, Set<string>>();
  for (const r of parseRows(UserDateRowSchema, rows, "rsvps")) {
    let set = out.get(r.user_id);
    if (!set) {
      set = new Set();
      out.set(r.user_id, set);
    }
    set.add(r.date_key);
  }
  return out;
}
