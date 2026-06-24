import { JUST_ONE_MAX_SCORE } from "./just-one/scoring";

// Scoring direction (`lowScoreWinsForSlug`, e.g. Phase 10 / Bandit are
// lowest-wins) and point-less free-for-alls (`isPointlessFreeForAll`, e.g.
// Villainous) now live in core so the server's profile win/loss + performance
// stats read the exact same rules the web does. Re-exported here so existing web
// call sites (forms, read-side cards, result badges) keep importing from one place.
export { isPointlessFreeForAll, lowScoreWinsForSlug } from "@boardgames/core/history/score-config";

/**
 * Maximum attainable score for scored co-ops (Just One banks up to 13). Lets the
 * match-history badge show a perfect game in green. Undefined → no known max.
 * Web-only — depends on the per-game scoring module.
 */
const COOP_MAX_SCORE: Record<string, number> = { "just-one": JUST_ONE_MAX_SCORE };

export function coopMaxScoreForSlug(slug: string | null): number | undefined {
  return slug ? COOP_MAX_SCORE[slug] : undefined;
}
