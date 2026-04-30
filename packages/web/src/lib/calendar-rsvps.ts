import { apiUrl } from "./api-base";

export type RsvpStatus = "yes" | "no";

export async function setRsvp(date: string, status: RsvpStatus): Promise<void> {
  const res = await fetch(apiUrl("/api/calendar/rsvp"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, status }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to RSVP (${res.status})`);
  }
}

export async function clearRsvp(date: string): Promise<void> {
  const res = await fetch(apiUrl("/api/calendar/rsvp"), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to clear RSVP (${res.status})`);
  }
}
