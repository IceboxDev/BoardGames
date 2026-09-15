// Schemas live in core. The four `if (data && typeof data === "object" && !Array.isArray(data))`
// blocks this file used to host have been replaced by `apiFetch(..., { response: SomeSchema })`.

import {
  AdminAwayDaysResponseSchema,
  AggregateAvailabilityMapSchema,
  AvailabilityCountsSchema,
  AvailabilityMapSchema,
  AwayDaysResponseSchema,
  OkResponseSchema,
  PushAvailabilityBodySchema,
  SetAwayDayBodySchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export type {
  AggregateAvailabilityMap,
  Availability,
  AvailabilityCounts,
  AvailabilityEntry,
  AvailabilityMap,
} from "@boardgames/core/protocol";

const ENDPOINT = "/api/user/availability";

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function cycleAvailability(
  current: "can" | "maybe" | undefined,
): "can" | "maybe" | undefined {
  if (current === undefined) return "can";
  if (current === "can") return "maybe";
  return undefined;
}

export async function fetchAvailability(signal?: AbortSignal) {
  return apiFetch(ENDPOINT, { response: AvailabilityMapSchema, signal });
}

export async function pushAvailability(data: Record<string, "can" | "maybe">) {
  return apiFetch(ENDPOINT, {
    method: "PUT",
    body: data,
    request: PushAvailabilityBodySchema,
    response: OkResponseSchema,
  });
}

export function mapsEqual(
  a: Record<string, "can" | "maybe">,
  b: Record<string, "can" | "maybe">,
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

export async function adminFetchAvailability(userId: string, signal?: AbortSignal) {
  return apiFetch(`/api/admin/users/${userId}/availability`, {
    response: AvailabilityMapSchema,
    signal,
  });
}

export async function fetchAvailabilityCounts(signal?: AbortSignal) {
  return apiFetch("/api/availability/counts", {
    response: AvailabilityCountsSchema,
    signal,
  });
}

export async function adminFetchAllAvailability(signal?: AbortSignal) {
  return apiFetch("/api/admin/availability/all", {
    response: AggregateAvailabilityMapSchema,
    signal,
  });
}

/** Every member's admin-noted away days from today on (userId → date keys). */
export async function adminFetchAwayDays(signal?: AbortSignal): Promise<Record<string, string[]>> {
  const res = await apiFetch("/api/admin/availability/away", {
    response: AdminAwayDaysResponseSchema,
    signal,
  });
  return res.awayByUser;
}

/** Note (or clear) one member's away day; resolves to their remaining away days. */
export async function adminSetAwayDay(
  userId: string,
  dateKey: string,
  away: boolean,
): Promise<string[]> {
  const res = await apiFetch(`/api/admin/users/${userId}/away`, {
    method: "PUT",
    body: { dateKey, away },
    request: SetAwayDayBodySchema,
    response: AwayDaysResponseSchema,
  });
  return res.days;
}
