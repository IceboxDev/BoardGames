// Per-game scoring rules that match outcomes don't carry in their payload —
// they're a property of the *game*, keyed by slug. Lives in core so both the
// web (form highlight, read-side cards, result badges) and the server (profile
// win/loss + performance stats) read one source of truth. Before this lived in
// web only, which silently made the server-side stats assume highest-wins for
// every game — wrong for penalty games like Phase 10.

/**
 * Slugs whose scoring is inverted: the *lowest* total wins (penalty-style).
 * Default is highest-wins; add Skyjo, golf-style card games, etc. here.
 */
const LOW_SCORE_WINS = new Set<string>(["phase-10", "bandit"]);

export function lowScoreWinsForSlug(slug: string | null | undefined): boolean {
  return !!slug && LOW_SCORE_WINS.has(slug);
}

/**
 * Point-less free-for-all games: no scores, the sole winner is marked `rank: 1`
 * (Villainous, Lovecraft Letter). They get a plain Won/Lost treatment — no
 * numeric placement and no partial placement credit.
 */
const POINTLESS_FFA = new Set<string>(["villainous", "lovecraft-letter"]);

export function isPointlessFreeForAll(slug: string | null | undefined): boolean {
  return !!slug && POINTLESS_FFA.has(slug);
}
