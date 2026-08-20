// ── CONTRACT status (migration 0010's unfinished second half) ─────────
//
// `user_availability_days` is now the ONLY table any read path consults.
// Repointed in this pass: the calendar heat map (`availability-counts.ts`),
// the next-night banner and players directory (`next-night.ts`), and both
// admin coverage views (`admin-availability.ts`) — the last readers of the
// legacy `user_availability` JSON blob.
//
// The blob is still WRITTEN by `PUT /api/user/availability`, on purpose: while
// it stays in sync, reverting these read paths is a code-only rollback with no
// data implications. Dropping the table is the CONTRACT's final step and must
// be its own deploy, after this one has been proven in production — see
// `scripts/check-availability-drift.ts`, which compares the two sources
// read-only and is the go/no-go for that migration.
//
// ── Merge rules ───────────────────────────────────────────────────────
//
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
// Important: the merge only considers RSVPs on *currently-locked* dates —
// `unlocked_at IS NULL`, not merely "a `locked_dates` row exists".
//
// RSVP rows survive an unlock + re-lock cycle (migration 0035 made unlocking a
// mark rather than a cascading delete), so an explicit "no" outlives it and a
// re-locked night comes back with its guest list intact. That also means a date
// that is no longer a game night still has `rsvp.yes` rows sitting there. If we
// merged those blindly, the user's own availability calendar would show "can"
// on an unlocked date and snap back every time they tried to clear it (the
// carousel only opens the RSVP modal on locked cells — unlocked cells go
// through availability cycling). The `EXISTS (locked_dates … unlocked_at IS
// NULL)` filter is what keeps stored availability fully editable once a night
// is called off, while still honouring active RSVPs for the heat / pie /
// personal mark on nights that ARE on.

import { AvailabilitySchema } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";

export type AvailabilityStatus = "can" | "maybe";
export type AvailabilityRecord = Record<string, AvailabilityStatus>;

// ── Reading stored availability ────────────────────────────────────────
//
// `user_availability_days` (migration 0010) is the source of truth. The legacy
// `user_availability` JSON blob is still written by the PUT as a rollback
// backstop, but nothing reads it any more — every reader goes through the two
// helpers below, so there is exactly one definition of "what did this person
// mark". Reading both was the actual hazard: the calendar cells and the
// lock-in flow read the table while the heat map, the next-night banner and
// the admin coverage view read the blob, with no constraint, no test and no
// drift check tying the two together.

/** `SELECT date_key, status FROM user_availability_days WHERE user_id = ?`. */
const AvailabilityDayRowSchema = z.object({
  date_key: z.string(),
  status: z.enum(["can", "maybe"]),
});

/** `SELECT user_id, date_key, status FROM user_availability_days`. */
const AvailabilityDayByUserRowSchema = z.object({
  user_id: z.string(),
  date_key: z.string(),
  status: z.enum(["can", "maybe"]),
});

/** One member's marked days. */
export async function fetchAvailabilityDaysForUser(
  db: Client,
  userId: string,
): Promise<AvailabilityRecord> {
  const { rows } = await db.execute({
    sql: "SELECT date_key, status FROM user_availability_days WHERE user_id = ?",
    args: [userId],
  });
  const out: AvailabilityRecord = {};
  for (const r of parseRows(AvailabilityDayRowSchema, rows, "user_availability_days")) {
    out[r.date_key] = r.status;
  }
  return out;
}

/**
 * Everyone's marked days, keyed by user id. `fromDateKey` bounds the scan to
 * the dates a caller can actually use — the date_key index makes that a range
 * seek instead of a full read of the table.
 */
export async function fetchAllAvailabilityDays(
  db: Client,
  opts: { fromDateKey?: string } = {},
): Promise<Map<string, AvailabilityRecord>> {
  const { rows } = await db.execute(
    opts.fromDateKey === undefined
      ? { sql: "SELECT user_id, date_key, status FROM user_availability_days", args: [] }
      : {
          sql: "SELECT user_id, date_key, status FROM user_availability_days WHERE date_key >= ?",
          args: [opts.fromDateKey],
        },
  );
  const out = new Map<string, AvailabilityRecord>();
  for (const r of parseRows(AvailabilityDayByUserRowSchema, rows, "user_availability_days")) {
    let entry = out.get(r.user_id);
    if (!entry) {
      entry = {};
      out.set(r.user_id, entry);
    }
    entry[r.date_key] = r.status;
  }
  return out;
}

/**
 * Parse a stored `availability_json` blob into a typed map, dropping any
 * entries whose status isn't a valid `AvailabilitySchema` member.
 *
 * Per-entry leniency is preserved on purpose: an old/garbled status value
 * for one date shouldn't prevent the user's other dates from rendering.
 * Strict whole-blob validation would also break legacy rows on schema
 * extensions — using per-entry safeParse lets new statuses roll out
 * without retroactively invalidating stored data.
 *
 * NO PRODUCTION READER CALLS THIS ANY MORE. It is kept deliberately, as the
 * other half of the rollback backstop: the PUT still dual-writes the legacy
 * blob, so reverting the read paths to it stays a code-only change. It goes
 * when the blob does — see the CONTRACT note at the top of this file.
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
            AND EXISTS (SELECT 1 FROM locked_dates l
                        WHERE l.date_key = r.date_key AND l.unlocked_at IS NULL)`,
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
            AND EXISTS (SELECT 1 FROM locked_dates l
                        WHERE l.date_key = r.date_key AND l.unlocked_at IS NULL)`,
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
