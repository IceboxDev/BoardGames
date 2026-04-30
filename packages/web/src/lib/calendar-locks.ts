import { apiUrl } from "./api-base";

export type LockedDate = {
  lockedBy: string;
  lockedAt: string;
  expectedUserIds: string[];
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
    return data as CalendarLocks;
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
    throw new Error(body.error ?? `Failed to lock date (${res.status})`);
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
    throw new Error(body.error ?? `Failed to unlock date (${res.status})`);
  }
}
