// Derived ownership, composed. A stored inventory holds what a person
// physically has on the shelf — catalog games, EXIT boxes (`exit-games.ts`),
// and card decks (`card-decks.ts`). What they can PLAY is wider: a deck
// unlocks its games, and any EXIT box unlocks the votable "exit" anchor.
// Every server-side reader of `user_inventory` that reasons about playable /
// owned games goes through this module so the two derivations can never be
// applied inconsistently.

import { withDeckGames } from "./card-decks.ts";
import { CATALOG_SLUGS } from "./catalog.ts";
import { withExitAnchor } from "./exit-games.ts";

/**
 * Expand a stored inventory into everything it makes playable. Mutates and
 * returns the given set; pseudo-slugs (decks) and EXIT box slugs stay in the
 * set — they resolve to no catalog game and are ignored downstream.
 */
export function expandOwnedSlugs(slugs: Set<string>): Set<string> {
  return withExitAnchor(withDeckGames(slugs));
}

/**
 * The catalog games a stored inventory amounts to — expanded, then filtered
 * to real catalog slugs. This is the "owned library" view: profile pages and
 * owned-games counts use it so a deck counts as its games, not as one
 * mystery row, and box/deck pseudo-slugs never leak into game lists.
 */
export function ownedCatalogSlugs(slugs: Iterable<string>): Set<string> {
  const expanded = expandOwnedSlugs(new Set(slugs));
  const out = new Set<string>();
  for (const slug of expanded) if (CATALOG_SLUGS.has(slug)) out.add(slug);
  return out;
}
