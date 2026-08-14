import { describe, expect, it } from "vitest";
import { GameSlugSchema } from "../protocol/common.ts";
import { CATALOG_SLUGS } from "./catalog.ts";
import {
  EXIT_CATALOG_SLUG,
  EXIT_GAME_SLUGS,
  EXIT_GAMES,
  exitGameBySlug,
  exitGameTitle,
  isExitGameSlug,
} from "./exit-games.ts";

describe("EXIT_GAMES", () => {
  it("has unique slugs", () => {
    expect(EXIT_GAME_SLUGS.size).toBe(EXIT_GAMES.length);
  });

  it("has unique BGG ids where present", () => {
    const ids = EXIT_GAMES.map((g) => g.bggId).filter((id): id is number => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every slug is exit-prefixed, kebab-case, and wire-valid", () => {
    for (const g of EXIT_GAMES) {
      expect(g.slug.startsWith("exit-")).toBe(true);
      expect(() => GameSlugSchema.parse(g.slug)).not.toThrow();
    }
  });

  it("no box slug collides with a catalog slug", () => {
    for (const slug of EXIT_GAME_SLUGS) {
      expect(CATALOG_SLUGS.has(slug)).toBe(false);
    }
  });

  it("the votable anchor exists in the catalog but is not a box", () => {
    expect(CATALOG_SLUGS.has(EXIT_CATALOG_SLUG)).toBe(true);
    expect(isExitGameSlug(EXIT_CATALOG_SLUG)).toBe(false);
  });

  it("lookup and title fallback work", () => {
    const cabin = exitGameBySlug("exit-abandoned-cabin");
    expect(cabin?.titleEn).toBe("The Abandoned Cabin");
    expect(exitGameTitle(cabin!)).toBe("The Abandoned Cabin");
    const kaenguru = exitGameBySlug("exit-kaenguru-eskapaden");
    expect(exitGameTitle(kaenguru!)).toBe("Die Känguru-Eskapaden");
    expect(exitGameBySlug("exit-nope")).toBeUndefined();
  });
});
