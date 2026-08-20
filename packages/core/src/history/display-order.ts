// The canonical display order for user-facing match lists.
//
// `played_at DESC` alone is NOT it: within a game night matches follow the
// admin-set `sortOrder` (drag-reorder on the history page), and backfilled
// matches all share the night's default timestamp, so raw played_at ordering
// scrambles curated nights — its id tiebreak can even invert them. That is
// exactly how a Storyteller's "ran" game ended up mid-night on a personal
// history while the global page showed it last.
//
// This mirrors HistoryPage's grouping and `/api/history/by-night`'s ordering
// so every surface (global history, personal timeline, profile recents)
// agrees on one sequence.

export type DisplayOrderKey = {
  /** The game night the match belongs to, if any. */
  dateKey: string | null;
  /** ISO timestamp; groups order by their newest one. */
  playedAt: string;
  /** Admin-curated order within a night — a new match takes the lowest. */
  sortOrder: number;
  id: number;
};

/**
 * Sort matches the way the global history page displays them, newest first:
 *
 * - Matches group by night (`dateKey`) — standalone matches by the UTC day of
 *   `playedAt`, the reorder endpoint's `dateKey: null` grouping.
 * - Groups order by their newest `playedAt`, newest group first.
 * - Within a group: ascending `sortOrder` (newest first by default, since a
 *   new match takes the lowest), then ascending id — the same order
 *   `/api/history/by-night` returns.
 *
 * Pure and non-mutating; `keyOf` adapts wire records (camelCase) and DB rows
 * (snake_case) alike.
 */
export function nightAwareDisplayOrder<T>(
  items: readonly T[],
  keyOf: (item: T) => DisplayOrderKey,
): T[] {
  type Group = { sortKey: string; members: { item: T; key: DisplayOrderKey }[] };
  const groups = new Map<string, Group>();
  for (const item of items) {
    const key = keyOf(item);
    const groupId = key.dateKey ? `lock:${key.dateKey}` : `day:${key.playedAt.slice(0, 10)}`;
    let g = groups.get(groupId);
    if (!g) {
      // A full timestamp always compares above its own day prefix, so the
      // max() below works from either seed.
      g = { sortKey: key.dateKey ?? key.playedAt.slice(0, 10), members: [] };
      groups.set(groupId, g);
    }
    if (key.playedAt > g.sortKey) g.sortKey = key.playedAt;
    g.members.push({ item, key });
  }
  const ordered = [...groups.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  const out: T[] = [];
  for (const g of ordered) {
    g.members.sort((a, b) => a.key.sortOrder - b.key.sortOrder || a.key.id - b.key.id);
    for (const m of g.members) out.push(m.item);
  }
  return out;
}
