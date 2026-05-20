import type { MatchKind } from "@boardgames/core/history/types";

/**
 * Per-game default match kind. Slugs not listed here fall back to "free-for-all"
 * (the most common shape — score-based, everyone-vs-everyone). Add or correct
 * entries here as the actual game kinds get clarified.
 */
export const MATCH_KIND_BY_SLUG: Record<string, MatchKind> = {
  // Cooperative — players share a single win/loss
  "aeons-end": "coop",
  "captain-sonar": "teams",
  "codenames-duet": "coop",
  "elements-of-truth": "coop",
  "escape-tales-the-awakening": "coop",
  frosthaven: "coop",
  gloomhaven: "coop",
  "gloomhaven-jaws-of-the-lion": "coop",
  pandemic: "coop",
  quiztopia: "coop",
  "sky-team": "coop",
  "the-crew-mission-deep-sea": "coop",
  "the-crew-quest-for-planet-nine": "coop",

  // Teams — two or more sides with collective scores
  "blood-on-the-clocktower": "teams",
  codenames: "teams",
  "codenames-pictures": "teams",
  decrypto: "teams",
  "one-night-ultimate-werewolf": "teams",
  "the-resistance": "teams",
  wavelength: "teams",
  "wer-wars": "teams",
  "wo-wars": "teams",

  // Elimination / last-standing
  bandit: "last-standing",
  chess: "last-standing",
  "chess-for-three": "last-standing",
  durak: "last-standing",
  "exploding-kittens": "last-standing",
  poker: "last-standing",
  "tellstones-kings-gambit": "last-standing",
  "the-fox-in-the-forest": "last-standing",

  // One-vs-many — asymmetric, one side vs the rest
  "betrayal-at-house-on-the-hill": "one-vs-many",
  "deadwood-1876": "one-vs-many",
  "hollywood-1947": "one-vs-many",
  "salem-1692": "one-vs-many",
  "scotland-yard": "one-vs-many",
  "tortuga-1667": "one-vs-many",
};

export function defaultKindForSlug(slug: string | null): MatchKind | null {
  if (!slug) return null;
  return MATCH_KIND_BY_SLUG[slug] ?? null;
}
