import { apiUrl } from "./api-base";
import type { RsvpStatus } from "./calendar-rsvps";

export type LockedDate = {
  lockedBy: string;
  lockedAt: string;
  expectedUserIds: string[];
  rsvps: Record<string, RsvpStatus>;
};

export type CalendarLocks = Record<string, LockedDate>;

export async function fetchCalendarLocks(signal?: AbortSignal): Promise<CalendarLocks> {
  const res = await fetch(apiUrl("/api/calendar/locks"), {
    credentials: "include",
    signal,
  });
  if (res.status === 401) return {};
  if (!res.ok) throw new Error(`Failed to fetch calendar locks (${res.status})`);
  const data = (await res.json()) as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    // Defend against older payload shapes that might lack `rsvps`.
    const out: CalendarLocks = {};
    for (const [date, raw] of Object.entries(data as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Partial<LockedDate>;
      out[date] = {
        lockedBy: typeof r.lockedBy === "string" ? r.lockedBy : "",
        lockedAt: typeof r.lockedAt === "string" ? r.lockedAt : "",
        expectedUserIds: Array.isArray(r.expectedUserIds) ? r.expectedUserIds : [],
        rsvps:
          r.rsvps && typeof r.rsvps === "object" && !Array.isArray(r.rsvps)
            ? (r.rsvps as Record<string, RsvpStatus>)
            : {},
      };
    }
    return out;
  }
  return {};
}

export async function adminSetCalendarLock(date: string): Promise<void> {
  const res = await fetch(apiUrl("/api/admin/calendar/lock"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to lock-in date (${res.status})`);
  }
}

export async function adminUnsetCalendarLock(date: string): Promise<void> {
  const res = await fetch(apiUrl("/api/admin/calendar/lock"), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to remove lock-in (${res.status})`);
  }
}
