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
    ["sky-team", "coop"],
    ["gloomhaven", "coop"],
    ["codenames", "teams"],
    ["chess", "last-standing"],
    ["exploding-kittens", "last-standing"],
    ["scotland-yard", "one-vs-many"],
    ["betrayal-at-house-on-the-hill", "one-vs-many"],
  ])("maps %s → %s", (slug, expected) => {
    expect(defaultKindForSlug(slug)).toBe(expected);
  });

  it("every entry in the map uses one of the four canonical kinds", () => {
    const valid = new Set(["coop", "teams", "last-standing", "one-vs-many", "free-for-all"]);
    for (const [slug, kind] of Object.entries(MATCH_KIND_BY_SLUG)) {
      expect(valid, `slug "${slug}" has unknown kind "${kind}"`).toContain(kind);
    }
  });
});
