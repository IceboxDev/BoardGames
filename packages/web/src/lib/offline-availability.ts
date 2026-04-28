export type Availability = "can" | "maybe";
export type AvailabilityMap = Record<string, Availability>;

const PREFIX = "boardgames:offline:availability:v1:";

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadAvailability(userId: string): AvailabilityMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as AvailabilityMap;
    return {};
  } catch {
    return {};
  }
}

export function saveAvailability(userId: string, data: AvailabilityMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(data));
  } catch {
    // quota or privacy mode — silently ignore
  }
}

export function cycleAvailability(current: Availability | undefined): Availability | undefined {
  if (current === undefined) return "can";
  if (current === "can") return "maybe";
  return undefined;
}
