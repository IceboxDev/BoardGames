// Turning stored leaderboard entries into renderable rows.
//
// Lives apart from `LeaderboardList` so that file stays components-only (React
// fast refresh wants one or the other).

import type { SkillPlayerRef } from "@boardgames/core/protocol";
import type { LeaderboardRow } from "./LeaderboardList.tsx";

/**
 * Board entries → rows, dropping anyone the side-car can't name.
 *
 * Ratings are only recomputed when an admin asks, so a member removed since
 * the last run can linger in the stored payload with no `user` row behind
 * them. A ghost row reading "Unknown player" is worse than one fewer row.
 */
export function toBoardRows<E extends { userId: string; rank: number }>(
  entries: readonly E[],
  players: Record<string, SkillPlayerRef>,
  value: (entry: E) => string,
): LeaderboardRow[] {
  return entries.flatMap((e) => {
    const ref = players[e.userId];
    if (!ref) return [];
    return [{ userId: e.userId, name: ref.name, image: ref.image, rank: e.rank, value: value(e) }];
  });
}
