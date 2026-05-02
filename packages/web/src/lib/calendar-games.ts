import { apiUrl } from "./api-base";

export type ReactionKind = "hype" | "teach" | "learn";

export type ReactionAggregate = {
  hype: number;
  teach: number;
  learn: number;
  /** Reactions the current viewer has set on this game. */
  viewer: ReactionKind[];
};

export type AvailableGames = {
  ownedSlugs: string[];
  /** Confirmed attendees: (availability:can ∪ rsvp:yes) − rsvp:no. */
  definiteCount: number;
  /** Maybes who haven't RSVP'd — widen the player-count upper bound only. */
  tentativeCount: number;
  /** Same as definite — kept for callers that want the id list. */
  participantIds: string[];
  /** Per-game reaction counts plus the viewer's own active reactions. */
  reactions: Record<string, ReactionAggregate>;
};

function emptyAggregate(): ReactionAggregate {
  return { hype: 0, teach: 0, learn: 0, viewer: [] };
}

const VALID_KINDS: ReactionKind[] = ["hype", "teach", "learn"];

function parseAggregate(raw: unknown): ReactionAggregate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyAggregate();
  const r = raw as Partial<ReactionAggregate>;
  return {
    hype: typeof r.hype === "number" ? r.hype : 0,
    teach: typeof r.teach === "number" ? r.teach : 0,
    learn: typeof r.learn === "number" ? r.learn : 0,
    viewer: Array.isArray(r.viewer)
      ? (r.viewer.filter((v): v is ReactionKind =>
          VALID_KINDS.includes(v as ReactionKind),
        ) as ReactionKind[])
      : [],
  };
}

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
  const data = (await res.json()) as Partial<AvailableGames> & {
    reactions?: Record<string, unknown>;
  };
  const reactions: Record<string, ReactionAggregate> = {};
  if (data.reactions && typeof data.reactions === "object" && !Array.isArray(data.reactions)) {
    for (const [slug, raw] of Object.entries(data.reactions)) {
      reactions[slug] = parseAggregate(raw);
    }
  }
  return {
    ownedSlugs: Array.isArray(data.ownedSlugs) ? (data.ownedSlugs as string[]) : [],
    definiteCount: typeof data.definiteCount === "number" ? data.definiteCount : 0,
    tentativeCount: typeof data.tentativeCount === "number" ? data.tentativeCount : 0,
    participantIds: Array.isArray(data.participantIds) ? (data.participantIds as string[]) : [],
    reactions,
  };
}

export async function setGameReaction(
  date: string,
  slug: string,
  reaction: ReactionKind,
  on: boolean,
): Promise<void> {
  const res = await fetch(apiUrl("/api/calendar/games/reaction"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, slug, reaction, on }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to update reaction (${res.status})`);
  }
}
