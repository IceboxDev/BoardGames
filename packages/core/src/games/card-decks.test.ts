import { describe, expect, it } from "vitest";
import { GameSlugSchema } from "../protocol/common.ts";
import {
  BAVARIAN_DECK_SLUG,
  CARD_DECKS,
  DECK_GAME_SLUGS,
  DECK_SLUGS,
  FRENCH_DECK_SLUG,
  isDeckGameSlug,
  isDeckSlug,
  withDeckGames,
} from "./card-decks.ts";
import { CATALOG_SLUGS } from "./catalog.ts";
import { EXIT_GAME_SLUGS } from "./exit-games.ts";
import { expandOwnedSlugs, ownedCatalogSlugs } from "./ownership.ts";

describe("CARD_DECKS", () => {
  it("deck slugs are wire-valid and collide with nothing", () => {
    for (const slug of DECK_SLUGS) {
      expect(() => GameSlugSchema.parse(slug)).not.toThrow();
      expect(CATALOG_SLUGS.has(slug)).toBe(false);
      expect(EXIT_GAME_SLUGS.has(slug)).toBe(false);
    }
  });

  it("every unlocked game is a real catalog game, in exactly one deck", () => {
    const seen = new Set<string>();
    for (const deck of CARD_DECKS) {
      for (const game of deck.games) {
        expect(CATALOG_SLUGS.has(game)).toBe(true);
        expect(seen.has(game)).toBe(false);
        seen.add(game);
      }
    }
  });

  it("splits Schafkopf (Bavarian) from the French-deck games", () => {
    const french = CARD_DECKS.find((d) => d.slug === FRENCH_DECK_SLUG);
    const bavarian = CARD_DECKS.find((d) => d.slug === BAVARIAN_DECK_SLUG);
    expect(bavarian?.games).toEqual(["schafkopf"]);
    expect(french?.games).toContain("durak");
    expect(french?.games).toContain("rummy");
    expect(french?.games).toContain("kings-in-the-corner");
    expect(french?.games).not.toContain("schafkopf");
  });

  it("withDeckGames unlocks a deck's games and nothing else", () => {
    expect(withDeckGames(new Set([FRENCH_DECK_SLUG]))).toEqual(
      new Set([FRENCH_DECK_SLUG, "durak", "kings-in-the-corner", "rummy"]),
    );
    expect(withDeckGames(new Set([BAVARIAN_DECK_SLUG]))).toEqual(
      new Set([BAVARIAN_DECK_SLUG, "schafkopf"]),
    );
    expect(withDeckGames(new Set(["lost-cities"]))).toEqual(new Set(["lost-cities"]));
  });

  it("predicates agree with the data", () => {
    expect(isDeckSlug(FRENCH_DECK_SLUG)).toBe(true);
    expect(isDeckSlug("durak")).toBe(false);
    expect(isDeckGameSlug("schafkopf")).toBe(true);
    expect(isDeckGameSlug("lost-cities")).toBe(false);
    expect(DECK_GAME_SLUGS.size).toBe(4);
  });
});

describe("ownership", () => {
  it("expandOwnedSlugs applies deck and EXIT derivations together", () => {
    const owned = expandOwnedSlugs(
      new Set([FRENCH_DECK_SLUG, "exit-abandoned-cabin", "lost-cities"]),
    );
    expect(owned.has("durak")).toBe(true);
    expect(owned.has("rummy")).toBe(true);
    expect(owned.has("exit")).toBe(true);
    expect(owned.has("lost-cities")).toBe(true);
  });

  it("ownedCatalogSlugs filters pseudo-slugs out of the library view", () => {
    const library = ownedCatalogSlugs([BAVARIAN_DECK_SLUG, "exit-pharaohs-tomb", "set"]);
    expect(library).toEqual(new Set(["schafkopf", "exit", "set"]));
  });
});
