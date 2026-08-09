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

// Shared by POINTLESS_FFA (these duels are point-less) and isWinDrawLossFfa
// (they additionally allow a drawn game). Declared first so the set literal
// below can fold it in.
const WIN_DRAW_LOSS_FFA_SLUGS = ["chess", "connect-4"] as const;
const WIN_DRAW_LOSS_FFA = new Set<string>(WIN_DRAW_LOSS_FFA_SLUGS);

export function lowScoreWinsForSlug(slug: string | null | undefined): boolean {
  return !!slug && LOW_SCORE_WINS.has(slug);
}

/**
 * Point-less free-for-all games: no scores, the sole winner is marked `rank: 1`
 * (Villainous, Lovecraft Letter, and the win/draw/loss duels below). They get a
 * plain Won/Lost treatment — no numeric placement and no partial placement
 * credit.
 */
const POINTLESS_FFA = new Set<string>([
  "villainous",
  "villainous-introduction-to-evil",
  "lovecraft-letter",
  ...WIN_DRAW_LOSS_FFA_SLUGS,
]);

export function isPointlessFreeForAll(slug: string | null | undefined): boolean {
  return !!slug && POINTLESS_FFA.has(slug);
}

/**
 * Classic head-to-head duels recorded as win/draw/loss (chess, Connect 4):
 * point-less free-for-alls whose ONLY outcomes are one crowned winner
 * (`rank: 1`) or a drawn game (`draw: true` on the outcome). Drives the web's
 * dedicated Win/Draw/Loss form; a draw counts as half a win in performance
 * stats (participant-results.ts) and sits out of the win rate.
 */
export function isWinDrawLossFfa(slug: string | null | undefined): boolean {
  return !!slug && WIN_DRAW_LOSS_FFA.has(slug);
}
