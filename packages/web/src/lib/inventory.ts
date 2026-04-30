import { apiUrl } from "./api-base";

let cached: string[] | null = null;
let inFlight: Promise<string[]> | null = null;

export function getCachedInventory(): string[] | null {
  return cached;
}

export async function fetchMyInventory(): Promise<string[]> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(apiUrl("/api/user/inventory"), {
        credentials: "include",
      });
      if (res.status === 401) {
        cached = [];
        return cached;
      }
      if (!res.ok) throw new Error(`Failed to fetch inventory (${res.status})`);
      const data = (await res.json()) as unknown;
      cached = Array.isArray(data) ? (data as string[]) : [];
      return cached;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
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

export async function adminFetchPendingInventory(): Promise<string[]> {
  const res = await fetch(apiUrl("/api/admin/pending-inventory"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch pending inventory (${res.status})`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as string[]) : [];
}

export async function adminSavePendingInventory(slugs: string[]): Promise<void> {
  const res = await fetch(apiUrl("/api/admin/pending-inventory"), {
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
