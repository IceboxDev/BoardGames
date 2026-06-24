import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";

// Tie-breaking for scored free-for-all placement (7 Wonders et al.).
//
// A score-based free-for-all derives placement from the scores, but two players
// on the same score leave the order ambiguous — both would read as "2nd" with
// nobody in "3rd". To keep placement strict we pin an explicit `rank` (1..n) on
// every player whenever a tie exists; with all scores distinct we clear `rank`
// and fall back to score order (so games that genuinely allow co-winners keep
// that behaviour). The host breaks ties manually via `breakTie`.

type Player = MatchOutcomeFreeForAll["players"][number];

/** True when two or more players share a score (placement is otherwise ambiguous). */
export function hasScoreTie(players: Player[]): boolean {
  const seen = new Set<number>();
  for (const p of players) {
    if (seen.has(p.score)) return true;
    seen.add(p.score);
  }
  return false;
}

/**
 * Players in final placement order: explicit `rank` when present (a tie has been
 * pinned into a strict 1..n order), otherwise by score in the game's win
 * direction. Stable — equal keys keep input order.
 */
export function placementOrder(players: Player[], lowestWins: boolean): Player[] {
  const rankMode = players.some((p) => p.rank !== undefined);
  return [...players].sort((a, b) => {
    if (rankMode) {
      return (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY);
    }
    return lowestWins ? a.score - b.score : b.score - a.score;
  });
}

/**
 * Recompute `rank` from scores. When any players share a score we pin a strict
 * 1..n placement for everyone — preserving an earlier manual tie-break (via the
 * existing `rank`) within still-tied groups. With all scores distinct, `rank` is
 * cleared so placement falls back to the (already unambiguous) score order.
 */
export function reconcileRanks(players: Player[], lowestWins: boolean): Player[] {
  if (!hasScoreTie(players)) {
    return players.map((p) => ({ ...p, rank: undefined }));
  }
  const order = [...players].sort((a, b) => {
    const byScore = lowestWins ? a.score - b.score : b.score - a.score;
    if (byScore !== 0) return byScore;
    // Equal score: keep the earlier manual order (lower rank first), and for
    // freshly-tied players fall back to stable input order.
    return (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY);
  });
  const rankById = new Map(order.map((p, i) => [p.userId, i + 1]));
  return players.map((p) => ({ ...p, rank: rankById.get(p.userId) }));
}

/**
 * Move one player up/down within their tie group (players on the same score),
 * swapping placement with the adjacent tied player. A no-op when the neighbour
 * in that direction has a different score — you can't out-place a real gap.
 */
export function breakTie(
  players: Player[],
  userId: string,
  dir: "up" | "down",
  lowestWins: boolean,
): Player[] {
  const order = placementOrder(players, lowestWins);
  const i = order.findIndex((p) => p.userId === userId);
  if (i === -1) return players;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= order.length) return players;
  if (order[i].score !== order[j].score) return players; // not a tie in that direction
  const ranks = order.map((p, idx) => p.rank ?? idx + 1);
  [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
  const rankById = new Map(order.map((p, idx) => [p.userId, ranks[idx]]));
  return players.map((p) => ({ ...p, rank: rankById.get(p.userId) }));
}

/** Whether two player lists carry the same `rank` per user (order-independent). */
export function ranksEqual(a: Player[], b: Player[]): boolean {
  if (a.length !== b.length) return false;
  const bById = new Map(b.map((p) => [p.userId, p.rank]));
  return a.every((p) => bById.has(p.userId) && bById.get(p.userId) === p.rank);
}
