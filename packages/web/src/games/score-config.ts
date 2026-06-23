import { JUST_ONE_MAX_SCORE } from "./just-one/scoring";

/**
 * Slugs whose scoring is inverted: the player with the *lowest* total wins
 * (penalty-style scoring). Default is highest-wins; override here for games
 * like Phase 10, Skyjo, golf-style card games, etc.
 *
 * Used by the free-for-all form to highlight the leader, the read-side card to
 * mark the winning row, and the profile match-history placement badge.
 */
const LOW_SCORE_WINS = new Set<string>(["phase-10", "bandit"]);

export function lowScoreWinsForSlug(slug: string | null): boolean {
  if (!slug) return false;
  return LOW_SCORE_WINS.has(slug);
}

/**
 * Point-less free-for-all games: there are no scores, the sole winner is marked
 * with `rank: 1` (Villainous, Lovecraft Letter). They get a plain Won/Lost
 * treatment instead of a numeric placement.
 */
const POINTLESS_FFA = new Set<string>(["villainous", "lovecraft-letter"]);

export function isPointlessFreeForAll(slug: string | null): boolean {
  return !!slug && POINTLESS_FFA.has(slug);
}

/**
 * Maximum attainable score for scored co-ops (Just One banks up to 13). Lets the
 * match-history badge show a perfect game in green. Undefined → no known max.
 */
const COOP_MAX_SCORE: Record<string, number> = { "just-one": JUST_ONE_MAX_SCORE };

export function coopMaxScoreForSlug(slug: string | null): number | undefined {
  return slug ? COOP_MAX_SCORE[slug] : undefined;
}
