import { describe, expect, it } from "vitest";
import { games, weightStats } from "./registry";

describe("registry — shape invariants", () => {
  it("contains at least the games declared to have playable components", () => {
    const slugs = new Set(games.map((g) => g.slug));
    for (const required of [
      "lost-cities",
      "sky-team",
      "pandemic",
      "exploding-kittens",
      "set",
      "durak",
      "parks",
      "sushi-go",
    ]) {
      expect(slugs, `expected registry to include ${required}`).toContain(required);
    }
  });

  it("entries are sorted alphabetically by title", () => {
    const titles = games.map((g) => g.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });

  it("every entry has a non-empty slug, title, accentHex, and bgg block", () => {
    for (const g of games) {
      expect(g.slug, `slug missing`).toBeTruthy();
      expect(g.title, `title missing for ${g.slug}`).toBeTruthy();
      expect(g.accentHex, `accentHex missing for ${g.slug}`).toBeTruthy();
      expect(g.bgg, `bgg missing for ${g.slug}`).toBeTruthy();
    }
  });

  it("every entry resolves a three-length descriptions block (non-empty)", () => {
    for (const g of games) {
      expect(g.descriptions.tight.length, `${g.slug}.descriptions.tight`).toBeGreaterThan(0);
      expect(g.descriptions.default.length, `${g.slug}.descriptions.default`).toBeGreaterThan(0);
      expect(g.descriptions.loose.length, `${g.slug}.descriptions.loose`).toBeGreaterThan(0);
    }
  });

  it("slugs are unique across the registry", () => {
    const slugs = games.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every entry has a resolved thumbnail URL string", () => {
    for (const g of games) {
      expect(typeof g.thumbnail).toBe("string");
      expect(g.thumbnail.length).toBeGreaterThan(0);
    }
  });
});

describe("registry — family declarations", () => {
  it("every family member references a family id", () => {
    for (const g of games) {
      if (g.family) expect(g.family.id).toBeTruthy();
    }
  });

  it("at most one canonical per family id", () => {
    const canonicalByFamily = new Map<string, string[]>();
    for (const g of games) {
      if (!g.family?.canonical) continue;
      const list = canonicalByFamily.get(g.family.id) ?? [];
      list.push(g.slug);
      canonicalByFamily.set(g.family.id, list);
    }
    for (const [id, members] of canonicalByFamily) {
      expect(
        members,
        `family "${id}" has multiple canonical members: ${members.join(", ")}`,
      ).toHaveLength(1);
    }
  });
});

describe("weightStats", () => {
  it("min and max are positive numbers with min ≤ max", () => {
    expect(weightStats.min).toBeGreaterThan(0);
    expect(weightStats.max).toBeGreaterThan(0);
    expect(weightStats.min).toBeLessThanOrEqual(weightStats.max);
  });

  it("falls within the BGG complexity scale (1..5)", () => {
    expect(weightStats.min).toBeGreaterThanOrEqual(1);
    expect(weightStats.max).toBeLessThanOrEqual(5);
  });
});
