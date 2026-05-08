/**
 * Slugs whose scoring is inverted: the player with the *lowest* total wins
 * (penalty-style scoring). Default is highest-wins; override here for games
 * like Phase 10, Skyjo, golf-style card games, etc.
 *
 * Used by the free-for-all form to highlight the leader and by the read-side
 * card to mark the winning row in amber.
 */
const LOW_SCORE_WINS = new Set<string>(["phase-10"]);

export function lowScoreWinsForSlug(slug: string | null): boolean {
  if (!slug) return false;
  return LOW_SCORE_WINS.has(slug);
}
