import { apiUrl } from "./api-base";
import type { RsvpStatus } from "./calendar-rsvps";

export type LockHost = { userId: string; name: string };

export type LockedDate = {
  lockedBy: string;
  lockedAt: string;
  expectedUserIds: string[];
  rsvps: Record<string, RsvpStatus>;
  host: LockHost | null;
  /** Time of day in "HH:MM" format. */
  eventTime: string | null;
  address: string | null;
};

export type CalendarLocks = Record<string, LockedDate>;

export type LockInForm = {
  hostUserId?: string | null;
  hostName?: string | null;
  /** "HH:MM" or null. */
  eventTime?: string | null;
  address?: string | null;
};

export async function fetchCalendarLocks(signal?: AbortSignal): Promise<CalendarLocks> {
  const res = await fetch(apiUrl("/api/calendar/locks"), {
    credentials: "include",
    signal,
  });
  if (res.status === 401) return {};
  if (!res.ok) throw new Error(`Failed to fetch calendar locks (${res.status})`);
  const data = (await res.json()) as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    // Defend against older payload shapes that might lack new fields.
    const out: CalendarLocks = {};
    for (const [date, raw] of Object.entries(data as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Partial<LockedDate>;
      const rawHost = (raw as { host?: unknown }).host;
      let host: LockHost | null = null;
      if (rawHost && typeof rawHost === "object" && !Array.isArray(rawHost)) {
        const h = rawHost as Partial<LockHost>;
        if (typeof h.userId === "string") {
          host = { userId: h.userId, name: typeof h.name === "string" ? h.name : "" };
        }
      }
      out[date] = {
        lockedBy: typeof r.lockedBy === "string" ? r.lockedBy : "",
        lockedAt: typeof r.lockedAt === "string" ? r.lockedAt : "",
        expectedUserIds: Array.isArray(r.expectedUserIds) ? r.expectedUserIds : [],
        rsvps:
          r.rsvps && typeof r.rsvps === "object" && !Array.isArray(r.rsvps)
            ? (r.rsvps as Record<string, RsvpStatus>)
            : {},
        host,
        eventTime: typeof r.eventTime === "string" ? r.eventTime : null,
        address: typeof r.address === "string" ? r.address : null,
      };
    }
    return out;
  }
  return {};
}

export async function adminSetCalendarLock(date: string, form: LockInForm = {}): Promise<void> {
  const res = await fetch(apiUrl("/api/admin/calendar/lock"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date,
      hostUserId: form.hostUserId ?? null,
      hostName: form.hostName ?? null,
      eventTime: form.eventTime ?? null,
      address: form.address ?? null,
    }),
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
