import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_SLUGS, isCatalogSlug, isNightGame } from "./catalog.ts";

describe("catalog", () => {
  it("loads a non-empty catalog", () => {
    expect(CATALOG.length).toBeGreaterThan(0);
    expect(CATALOG_SLUGS.size).toBe(CATALOG.length);
  });

  it("has no duplicate slugs", () => {
    const slugs = CATALOG.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves a known slug and rejects an unknown one", () => {
    expect(isCatalogSlug("villainous")).toBe(true);
    expect(isCatalogSlug("not-a-real-game")).toBe(false);
  });

  // Villainous ships as two physical boxes seating different party sizes, so it
  // is two catalog games in one family — ownership is per-box. Guard against a
  // regression that collapses them back into a single game with an "edition".
  it("models each Villainous box as its own game", () => {
    const villainous = CATALOG.filter((g) => g.slug.startsWith("villainous"));
    expect(villainous.map((g) => g.slug).sort()).toEqual([
      "villainous",
      "villainous-introduction-to-evil",
    ]);
  });
});

describe("catalog — what a game night may offer", () => {
  it("keeps the Mensa IQ pack in the catalog but out of nights", () => {
    expect(isCatalogSlug("mensa-challenge-your-iq")).toBe(true);
    expect(isNightGame("mensa-challenge-your-iq")).toBe(false);
  });

  it("offers ordinary board games", () => {
    expect(isNightGame("codenames")).toBe(true);
    expect(isNightGame("the-hunger")).toBe(true);
  });
});
