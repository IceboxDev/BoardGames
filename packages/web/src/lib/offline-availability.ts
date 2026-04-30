import { apiUrl } from "./api-base";

export type Availability = "can" | "maybe";
export type AvailabilityMap = Record<string, Availability>;

const ENDPOINT = "/api/user/availability";

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function cycleAvailability(current: Availability | undefined): Availability | undefined {
  if (current === undefined) return "can";
  if (current === "can") return "maybe";
  return undefined;
}

export async function fetchAvailability(signal?: AbortSignal): Promise<AvailabilityMap> {
  const res = await fetch(apiUrl(ENDPOINT), { credentials: "include", signal });
  if (res.status === 401) return {};
  if (!res.ok) throw new Error(`Failed to fetch availability (${res.status})`);
  const data = (await res.json()) as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as AvailabilityMap;
  }
  return {};
}

export async function pushAvailability(data: AvailabilityMap): Promise<void> {
  const res = await fetch(apiUrl(ENDPOINT), {
    credentials: "include",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Failed to save (${res.status})`);
  }
}

export function mapsEqual(a: AvailabilityMap, b: AvailabilityMap): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

export async function adminFetchAvailability(
  userId: string,
  signal?: AbortSignal,
): Promise<AvailabilityMap> {
  const res = await fetch(apiUrl(`/api/admin/users/${userId}/availability`), {
    credentials: "include",
    signal,
  });
  if (!res.ok) throw new Error(`Failed to fetch availability (${res.status})`);
  const data = (await res.json()) as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as AvailabilityMap;
  }
  return {};
}

export type AvailabilityEntry = { userId: string; name: string; status: Availability };
export type AggregateAvailabilityMap = Record<string, AvailabilityEntry[]>;

export type AvailabilityCounts = Record<string, { can: number; maybe: number }>;

export async function fetchAvailabilityCounts(signal?: AbortSignal): Promise<AvailabilityCounts> {
  const res = await fetch(apiUrl("/api/availability/counts"), {
    credentials: "include",
    signal,
  });
  if (res.status === 401) return {};
  if (!res.ok) throw new Error(`Failed to fetch availability counts (${res.status})`);
  const data = (await res.json()) as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as AvailabilityCounts;
  }
  return {};
}

export async function adminFetchAllAvailability(
  signal?: AbortSignal,
): Promise<AggregateAvailabilityMap> {
  const res = await fetch(apiUrl("/api/admin/availability/all"), {
    credentials: "include",
    signal,
  });
  if (!res.ok) throw new Error(`Failed to fetch aggregate availability (${res.status})`);
  const data = (await res.json()) as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as AggregateAvailabilityMap;
  }
  return {};
}
