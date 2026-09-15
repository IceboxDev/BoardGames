// Schemas + types live in core so server and web cannot drift. The hand-rolled
// 12-field defensive parser this file used to host has been replaced by
// `apiFetch(..., { response: CalendarLocksSchema })` — schema mismatch now
// throws a typed `SchemaError` rather than silently rendering stale shapes.

import {
  CalendarLocksSchema,
  HostStatsMapSchema,
  type LockInForm,
  LockInRequestBodySchema,
  LockInResponseSchema,
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
