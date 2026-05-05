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
  /** ISO timestamp set by the host or admin when the guest list was sealed.
   * When non-null, no user outside `expectedUserIds` may RSVP. */
  picksLockedAt: string | null;
  /** Per-date headcount used for the N/N badge on a picks-locked cell.
   * `definite` = RSVP-yes (cans ∪ rsvpYes − rsvpNo).
   * `tentative` = maybes who haven't been overridden by a yes or no.
   * The badge shows "definite / definite+tentative". */
  attendance: { definite: number; tentative: number };
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
        picksLockedAt: typeof r.picksLockedAt === "string" ? r.picksLockedAt : null,
        attendance:
          r.attendance &&
          typeof r.attendance === "object" &&
          !Array.isArray(r.attendance) &&
          typeof (r.attendance as { definite?: unknown }).definite === "number" &&
          typeof (r.attendance as { tentative?: unknown }).tentative === "number"
            ? {
                definite: (r.attendance as { definite: number }).definite,
                tentative: (r.attendance as { tentative: number }).tentative,
              }
            : { definite: 0, tentative: 0 },
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

/**
 * Seal or unseal the guest list. Server permits the call only when the
 * caller is an admin OR the host of that date. While sealed, no one outside
 * the original expected_user_ids may RSVP.
 */
export async function togglePicksLock(date: string, on: boolean): Promise<void> {
  const res = await fetch(apiUrl("/api/calendar/lock-picks"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, on }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to toggle picks-lock (${res.status})`);
  }
}
