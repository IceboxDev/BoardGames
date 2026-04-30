import { apiUrl } from "./api-base";

export async function adminSetOnline(userId: string, onlineEnabled: boolean): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/users/${userId}/online`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ onlineEnabled }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
}
