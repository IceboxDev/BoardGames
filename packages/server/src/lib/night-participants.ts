// The one place that decides who is on a locked night.
//
// Open nights: whoever marked "can" or RSVP'd yes is coming, minus explicit
// "no"s; "maybe"s are tentative. Private nights: availability marks mean
// nothing — only the guest list (`expected_user_ids_json`) and its explicit
// RSVPs count, the host holds seat 1, the remaining seats go to "yes"
// answers in the order they arrived, and the overflow is a waitlist. Nothing
// about seating is stored, so a freed seat promotes the next in line by
// construction.
//
// `/locks`, the per-date games payload (and through it the iCalendar feed),
// the EXIT vote, next-night, the greeting queue and every write gate call
// this instead of re-deriving their own idea of "attending".

import type { PickMode, SeatState } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";

// ── Lock row ───────────────────────────────────────────────────────────

/** Every column a reader of `locked_dates` might want, in one projection. */
export const NIGHT_LOCK_COLUMNS =
  "date_key, locked_by, locked_at, expected_user_ids_json, host_user_id, host_name, " +
  "event_time, address, picks_locked_at, host_at_home, unlocked_at, private, seat_count, " +
  "pick_mode, admin_picks, title, " +
  // Admins may pick on every private night (see `derivePrivate`), so each
  // lock carries the current admin list — one subquery, no extra round trip.
  `(SELECT json_group_array(id) FROM "user" WHERE role = 'admin') AS admin_ids_json`;

export const NightLockRowSchema = z.object({
  date_key: z.string(),
  locked_by: z.string(),
  locked_at: z.string(),
  expected_user_ids_json: jsonColumn(z.array(z.string())),
  host_user_id: z.string().nullable(),
  host_name: z.string().nullable(),
  event_time: z.string().nullable(),
  address: z.string().nullable(),
  picks_locked_at: z.string().nullable(),
  host_at_home: z.number().nullable(),
  unlocked_at: z.string().nullable(),
  private: z.union([z.number(), z.boolean()]),
  seat_count: z.number().nullable(),
  pick_mode: z.enum(["group", "host"]),
  admin_picks: z.union([z.number(), z.boolean()]),
  title: z.string().nullable(),
  admin_ids_json: jsonColumn(z.array(z.string())),
});

export type NightLock = {
  dateKey: string;
  lockedBy: string;
  lockedAt: string;
  expectedUserIds: string[];
  hostUserId: string | null;
  hostName: string | null;
  eventTime: string | null;
  address: string | null;
  picksLockedAt: string | null;
  /** NULL in the DB (legacy rows) reads as true — the uncapped-host default. */
  hostAtHome: boolean;
  unlockedAt: string | null;
  isPrivate: boolean;
  seatCount: number | null;
  pickMode: PickMode;
  title: string | null;
  /** Every admin's user id: they may pick on any private night. */
  adminUserIds: string[];
};

/**
 * When the night's picks count as sealed. An open night seals when the host
 * toggles the padlock; a private night's guest list IS the invitation, so it
 * is sealed from the moment it is locked in — there is no second lock to
 * turn, and every "sealed" consumer (the D&D / EXIT takeovers, the feed's
 * bring-list prefix) sees it that way.
 */
export function sealedAt(
  lock: Pick<NightLock, "isPrivate" | "picksLockedAt" | "lockedAt">,
): string | null {
  return lock.isPrivate ? (lock.picksLockedAt ?? lock.lockedAt) : lock.picksLockedAt;
}

export function nightLockFromRow(row: z.infer<typeof NightLockRowSchema>): NightLock {
  return {
    dateKey: row.date_key,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    expectedUserIds: row.expected_user_ids_json,
    hostUserId: row.host_user_id,
    hostName: row.host_name,
    eventTime: row.event_time,
    address: row.address,
    picksLockedAt: row.picks_locked_at,
    hostAtHome: row.host_at_home === null ? true : row.host_at_home !== 0,
    unlockedAt: row.unlocked_at,
    isPrivate: row.private === true || row.private === 1,
    seatCount: row.seat_count,
    // 'admin' is stored as pick_mode 'host' + the admin_picks flag (0066).
    pickMode: row.admin_picks === true || row.admin_picks === 1 ? "admin" : row.pick_mode,
    title: row.title,
    adminUserIds: row.admin_ids_json,
  };
}

/** The active lock for `date`, or null when the date is not (or no longer) locked. */
export async function loadNightLock(db: Client, date: string): Promise<NightLock | null> {
  const { rows } = await db.execute({
    sql: `SELECT ${NIGHT_LOCK_COLUMNS} FROM locked_dates WHERE date_key = ? AND unlocked_at IS NULL LIMIT 1`,
    args: [date],
  });
  const row = rows[0];
  return row ? nightLockFromRow(parseRow(NightLockRowSchema, row, "locked_dates")) : null;
}

/** Every active lock, keyed by date. */
export async function loadActiveNightLocks(db: Client): Promise<Map<string, NightLock>> {
  const { rows } = await db.execute(
    `SELECT ${NIGHT_LOCK_COLUMNS} FROM locked_dates WHERE unlocked_at IS NULL`,
  );
  const out = new Map<string, NightLock>();
  for (const row of parseRows(NightLockRowSchema, rows, "locked_dates")) {
    out.set(row.date_key, nightLockFromRow(row));
  }
  return out;
}

// ── Participants ───────────────────────────────────────────────────────

export type NightRsvpRow = {
  user_id: string;
  status: "yes" | "no";
  /** SQLite datetime; may carry fractional seconds. Lexical order is time order. */
  rsvped_at: string;
};

export type NightAvailabilityRow = { user_id: string; status: "can" | "maybe" };

export type NightParticipants = {
  isPrivate: boolean;
  /** Coming for sure. Private: the seated players (host first). */
  definite: string[];
  /** Might come. Open: "maybe" markers. Private: always empty — the waitlist
   *  is listed separately and must never widen the player window. */
  tentative: string[];
  seated: string[];
  waitlisted: string[];
  /** Invited, no answer yet (private only). */
  invitedNoAnswer: string[];
  /** Invited, said no (private only). */
  declined: string[];
  seats: { total: number; taken: number; waitlisted: number } | null;
  /** Headcount window a game must cover to be playable. */
  window: { lo: number; hi: number };
  /** Whose reactions count toward the lineup. */
  voters: Set<string>;
  seatOf(userId: string): SeatState | null;
  canView(viewerId: string, isAdmin: boolean): boolean;
  canRsvp(viewerId: string): boolean;
  canReact(viewerId: string, isAdmin: boolean): boolean;
};

type LockInputs = Pick<
  NightLock,
  "isPrivate" | "seatCount" | "pickMode" | "hostUserId" | "expectedUserIds"
> & { adminUserIds?: readonly string[] };

export function deriveNightParticipants(
  lock: LockInputs,
  rsvps: readonly NightRsvpRow[],
  availability: readonly NightAvailabilityRow[],
): NightParticipants {
  return lock.isPrivate ? derivePrivate(lock, rsvps) : deriveOpen(rsvps, availability);
}

function deriveOpen(
  rsvps: readonly NightRsvpRow[],
  availability: readonly NightAvailabilityRow[],
): NightParticipants {
  const can = new Set<string>();
  const maybe = new Set<string>();
  for (const a of availability) (a.status === "can" ? can : maybe).add(a.user_id);
  const yes = new Set<string>();
  const no = new Set<string>();
  for (const r of rsvps) (r.status === "yes" ? yes : no).add(r.user_id);

  // Explicit "no" wins over everything else.
  const definite = new Set<string>();
  for (const id of can) if (!no.has(id)) definite.add(id);
  for (const id of yes) if (!no.has(id)) definite.add(id);
  const tentative = [...maybe].filter((id) => !definite.has(id) && !no.has(id));
  const definiteIds = [...definite];

  return {
    isPrivate: false,
    definite: definiteIds,
    tentative,
    seated: [],
    waitlisted: [],
    invitedNoAnswer: [],
    declined: [],
    seats: null,
    window: { lo: definiteIds.length, hi: definiteIds.length + tentative.length },
    voters: definite,
    seatOf: () => null,
    canView: () => true,
    // The sealed-guest-list gate is the route's business (it needs
    // picks_locked_at); membership alone never blocks an open night.
    canRsvp: () => true,
    canReact: () => true,
  };
}

function derivePrivate(lock: LockInputs, rsvps: readonly NightRsvpRow[]): NightParticipants {
  const host = lock.hostUserId;
  const invited = new Set(lock.expectedUserIds);
  if (host) invited.add(host);
  // Seat 1 is the host's; the rest are for invitees.
  const total = Math.max(1, lock.seatCount ?? 1);

  const yesRows: NightRsvpRow[] = [];
  const declined: string[] = [];
  for (const r of rsvps) {
    // Rows from people no longer (or never) on the list — an outsider's
    // stale "yes" from before the night went private, a removed invitee —
    // are ignored entirely.
    if (!invited.has(r.user_id) || r.user_id === host) continue;
    if (r.status === "yes") yesRows.push(r);
    else declined.push(r.user_id);
  }
  // First come, first served. `rsvped_at` may be second- or millisecond-
  // resolution; the user id breaks the remaining ties deterministically.
  yesRows.sort((a, b) =>
    a.rsvped_at < b.rsvped_at ? -1 : a.rsvped_at > b.rsvped_at ? 1 : a.user_id < b.user_id ? -1 : 1,
  );
  const queue = yesRows.map((r) => r.user_id);
  const guestSeats = Math.max(0, total - (host ? 1 : 0));
  const seated = [...(host ? [host] : []), ...queue.slice(0, guestSeats)];
  const waitlisted = queue.slice(guestSeats);
  const answered = new Set([...queue, ...declined, ...(host ? [host] : [])]);
  const invitedNoAnswer = [...invited].filter((id) => !answered.has(id));

  const seatedSet = new Set(seated);
  const waitSet = new Set(waitlisted);
  const declinedSet = new Set(declined);
  // Whose picks count. Admins may always pick, and their picks count in every
  // mode: with the seated players (group), beside the host (host picks), or
  // on their own — the host's own picks left out — in admin picks.
  const admins = lock.adminUserIds ?? [];
  const voters =
    lock.pickMode === "admin"
      ? new Set(admins.filter((id) => id !== host))
      : lock.pickMode === "host"
        ? new Set([...(host ? [host] : []), ...admins])
        : new Set([...seatedSet, ...admins]);

  return {
    isPrivate: true,
    definite: seated,
    tentative: [],
    seated,
    waitlisted,
    invitedNoAnswer,
    declined,
    seats: { total, taken: seated.length, waitlisted: waitlisted.length },
    // The host plans for the table they set, not for whoever has answered.
    window: { lo: total, hi: total },
    voters,
    seatOf: (id) =>
      id === host
        ? "host"
        : seatedSet.has(id)
          ? "seated"
          : waitSet.has(id)
            ? "waitlisted"
            : declinedSet.has(id)
              ? "declined"
              : invited.has(id)
                ? "invited"
                : null,
    canView: (id, isAdmin) => isAdmin || invited.has(id),
    canRsvp: (id) => invited.has(id),
    canReact: (id, isAdmin) => isAdmin || voters.has(id),
  };
}
