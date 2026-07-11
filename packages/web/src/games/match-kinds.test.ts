import { isCatalogSlug } from "@boardgames/core/games/catalog";
import { describe, expect, it } from "vitest";
import { defaultKindForSlug, MATCH_KIND_BY_SLUG } from "./match-kinds";

describe("defaultKindForSlug", () => {
  it("returns null when slug is null", () => {
    expect(defaultKindForSlug(null)).toBeNull();
  });

  it("returns null when slug is not in the map (caller decides the fallback)", () => {
    expect(defaultKindForSlug("not-a-real-game")).toBeNull();
  });

  it.each([
    ["pandemic", "coop"],
    ["just-one", "coop"],
    ["sky-team", "coop"],
    ["gloomhaven", "coop"],
    ["codenames", "teams"],
    ["chess", "last-standing"],
    ["dungeon-mayhem", "last-standing"],
    ["exploding-kittens", "last-standing"],
    // Players are knocked out as they run dry; the survivor wins — same shape
    // as Exploding Kittens, not a scored free-for-all.
    ["not-enough-mana", "last-standing"],
    ["dungeons-and-dragons", "coop"],
    ["scotland-yard", "one-vs-many"],
    ["betrayal-at-house-on-the-hill", "one-vs-many"],
    ["lovecraft-letter", "free-for-all"],
    ["villainous", "free-for-all"],
    ["villainous-introduction-to-evil", "free-for-all"],
  ])("maps %s → %s", (slug, expected) => {
    expect(defaultKindForSlug(slug)).toBe(expected);
  });

  it("every entry in the map uses one of the four canonical kinds", () => {
    const valid = new Set(["coop", "teams", "last-standing", "one-vs-many", "free-for-all"]);
    for (const [slug, kind] of Object.entries(MATCH_KIND_BY_SLUG)) {
      expect(valid, `slug "${slug}" has unknown kind "${kind}"`).toContain(kind);
    }
  });

  // A typo'd or retired slug here fails silently: the game just falls back to
  // free-for-all, which is exactly how `not-enough-mana` was mis-shaped.
  it("every slug in the map names a real catalog game", () => {
    for (const slug of Object.keys(MATCH_KIND_BY_SLUG)) {
      expect(isCatalogSlug(slug), `"${slug}" is not in the catalog`).toBe(true);
    }
  });
});
