import { apiUrl } from "./api-base";

export type AvailableGames = {
  ownedSlugs: string[];
  participantCount: number;
  participantIds: string[];
};

export async function fetchAvailableGames(
  date: string,
  signal?: AbortSignal,
): Promise<AvailableGames> {
  const res = await fetch(apiUrl(`/api/calendar/games?date=${encodeURIComponent(date)}`), {
    credentials: "include",
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to fetch available games (${res.status})`);
  }
  const data = (await res.json()) as Partial<AvailableGames>;
  return {
    ownedSlugs: Array.isArray(data.ownedSlugs) ? (data.ownedSlugs as string[]) : [],
    participantCount: typeof data.participantCount === "number" ? data.participantCount : 0,
    participantIds: Array.isArray(data.participantIds) ? (data.participantIds as string[]) : [],
  };
}
