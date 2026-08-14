// Traditional-deck card games are owned via the DECK, not per game: anyone
// with a French-suited 52-card deck can play every French-deck game in the
// catalog, and a Bavarian-suited (Eichel/Gras/Herz/Schellen) deck is what
// Schafkopf actually needs. Inventory therefore stores one of the two deck
// pseudo-slugs below, and `withDeckGames` derives the individual games —
// the same derived-ownership idea as the EXIT anchor (`exit-games.ts`),
// pointing the other way: one owned thing unlocks many catalog entries.
//
// The catalog games listed here are NOT directly ownable
// (`CatalogSlugListSchema` rejects them in inventory bodies) and the admin
// inventory grids hide them; `CardDeckList` renders the two deck toggles
// instead. Votes/reactions still target the games themselves — a hype for
// Durak is a hype for Durak, not for a deck.

export const FRENCH_DECK_SLUG = "deck-french-suited";
export const BAVARIAN_DECK_SLUG = "deck-bavarian-suited";

export interface CardDeck {
  /** Inventory pseudo-slug. Valid per `GameSlugSchema`, never a catalog slug. */
  slug: string;
  label: string;
  /** Short suit line shown under the label. */
  suits: string;
  /** Catalog games this deck unlocks. */
  games: readonly string[];
}

export const CARD_DECKS: readonly CardDeck[] = [
  {
    slug: FRENCH_DECK_SLUG,
    label: "French-suited deck",
    suits: "♠ ♥ ♦ ♣",
    games: ["durak", "kings-in-the-corner", "rummy"],
  },
  {
    slug: BAVARIAN_DECK_SLUG,
    label: "Bavarian-suited deck",
    suits: "Eichel · Gras · Herz · Schellen",
    games: ["schafkopf"],
  },
];

/** The deck pseudo-slugs themselves. */
export const DECK_SLUGS: ReadonlySet<string> = new Set(CARD_DECKS.map((d) => d.slug));

/** Every catalog game whose ownership is derived from a deck. */
export const DECK_GAME_SLUGS: ReadonlySet<string> = new Set(
  CARD_DECKS.flatMap((d) => [...d.games]),
);

/** True when `slug` names a card deck (an inventory pseudo-slug). */
export function isDeckSlug(slug: string): boolean {
  return DECK_SLUGS.has(slug);
}

/** True when `slug` names a catalog game that is owned via a deck. */
export function isDeckGameSlug(slug: string): boolean {
  return DECK_GAME_SLUGS.has(slug);
}

/**
 * Owning a deck implies owning every game it unlocks. Mutates and returns the
 * given set (same contract as `withExitAnchor`).
 */
export function withDeckGames(slugs: Set<string>): Set<string> {
  for (const deck of CARD_DECKS) {
    if (slugs.has(deck.slug)) {
      for (const game of deck.games) slugs.add(game);
    }
  }
  return slugs;
}
