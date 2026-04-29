import { apiUrl } from "./api-base";

export async function fetchMyInventory(): Promise<string[]> {
  const res = await fetch(apiUrl("/api/user/inventory"), {
    credentials: "include",
  });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Failed to fetch inventory (${res.status})`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as string[]) : [];
}

export async function adminFetchInventory(userId: string): Promise<string[]> {
  const res = await fetch(apiUrl(`/api/admin/users/${userId}/inventory`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch inventory (${res.status})`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as string[]) : [];
}

export async function adminSaveInventory(userId: string, slugs: string[]): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/users/${userId}/inventory`), {
    credentials: "include",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slugs }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to save (${res.status})`);
  }
}
