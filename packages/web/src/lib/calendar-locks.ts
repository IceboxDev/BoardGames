// Schemas + types live in core so server and web cannot drift. The hand-rolled
// 12-field defensive parser this file used to host has been replaced by
// `apiFetch(..., { response: CalendarLocksSchema })` — schema mismatch now
// throws a typed `SchemaError` rather than silently rendering stale shapes.

import {
  type CalendarLocks,
  CalendarLocksSchema,
  HostStatsMapSchema,
  type LockedDate,
  type LockInForm,
  LockInRequestBodySchema,
  LockInResponseSchema,
  nightKeysOf,
  nightSlot,
  OkResponseSchema,
  PicksLockBodySchema,
  type PrivateNightUpdateBody,
  PrivateNightUpdateBodySchema,
  UnlockBodySchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

// Re-export the protocol types so existing call sites that imported
// `CalendarLocks`, `LockedDate`, `LockHost`, `LockInForm` from this module
// keep working without churn.
export type {
  CalendarLocks,
  HostStats,
  HostStatsMap,
  LockedDate,
  LockHost,
  LockInForm,
  NightSeats,
  PickMode,
  PrivateNightUpdateBody,
  SeatState,
} from "@boardgames/core/protocol";

// ── Nights on a date ───────────────────────────────────────────────────
//
// `CalendarLocks` is keyed by NIGHT key: the date, or `date_2` for a second
// night on the same date. The calendar grid works per day, so these fold the
// map back into "what is on this date" — the calendar cell splits when there
// are two.

export type NightOnDate = { key: string; slot: 1 | 2; lock: LockedDate };

/** The locked nights on `date`, first slot first (0, 1 or 2 of them). */
export function nightsForDate(locks: CalendarLocks | undefined, date: string): NightOnDate[] {
  if (!locks) return [];
  const out: NightOnDate[] = [];
  for (const key of nightKeysOf(date)) {
    const lock = locks[key];
    if (lock) out.push({ key, slot: nightSlot(key), lock });
  }
  return out;
}

/** The key a new night on `date` would take, or null when both slots are taken. */
export function freeNightKey(locks: CalendarLocks | undefined, date: string): string | null {
  for (const key of nightKeysOf(date)) if (!locks?.[key]) return key;
  return null;
}

/** "2nd night" for a second-slot key, null for a date's first night. */
export function nightLabel(key: string): string | null {
  return nightSlot(key) === 2 ? "2nd night" : null;
}

export async function fetchCalendarLocks(signal?: AbortSignal) {
  return apiFetch("/api/calendar/locks", {
    response: CalendarLocksSchema,
    signal,
  });
}

/** Admin-only: per-user hosting stats for the lock-in host picker. */
export async function fetchHostStats(signal?: AbortSignal) {
  return apiFetch("/api/admin/calendar/host-stats", {
    response: HostStatsMapSchema,
    signal,
  });
}

export async function adminSetCalendarLock(date: string, form: LockInForm = {}) {
  return apiFetch("/api/admin/calendar/lock", {
    method: "POST",
    body: { date, ...form },
    request: LockInRequestBodySchema,
    response: LockInResponseSchema,
  });
}

export async function adminUnsetCalendarLock(date: string) {
  return apiFetch("/api/admin/calendar/lock", {
    method: "DELETE",
    body: { date },
    request: UnlockBodySchema,
    response: OkResponseSchema,
  });
}

/**
 * Seal or unseal the guest list. Server permits the call only when the
 * caller is an admin OR the host of that date. While sealed, no one outside
 * the original expected_user_ids may RSVP.
 */
export async function togglePicksLock(date: string, on: boolean) {
  return apiFetch("/api/calendar/lock-picks", {
    method: "POST",
    body: { date, on },
    request: PicksLockBodySchema,
    response: OkResponseSchema,
  });
}

/**
 * Host or admin: adjust a private night after lock-in — seats, pick mode,
 * title, invitees. Any subset of fields; the server applies them in one batch.
 */
export async function updatePrivateNight(
  date: string,
  patch: Omit<PrivateNightUpdateBody, "date">,
) {
  return apiFetch("/api/calendar/private-night", {
    method: "POST",
    body: { date, ...patch },
    request: PrivateNightUpdateBodySchema,
    response: OkResponseSchema,
  });
}
