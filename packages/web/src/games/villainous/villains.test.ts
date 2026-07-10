import { describe, expect, it } from "vitest";
import {
  isVillainousSlug,
  VILLAINOUS_BASE_SLUG,
  VILLAINOUS_INTRO_SLUG,
  VILLAINOUS_ROSTERS,
  villainsForGame,
} from "./villains";

describe("villainsForGame", () => {
  it("returns the four Introduction to Evil villains", () => {
    expect(villainsForGame(VILLAINOUS_INTRO_SLUG)).toEqual([
      "Captain Hook",
      "Maleficent",
      "Prince John",
      "Ursula",
    ]);
  });

  it("returns the six The Worst Takes it All villains", () => {
    expect(villainsForGame(VILLAINOUS_BASE_SLUG)).toEqual([
      "Captain Hook",
      "Jafar",
      "Maleficent",
      "Prince John",
      "Queen of Hearts",
      "Ursula",
    ]);
  });

  it("falls back to the six-villain superset for an unset or non-Villainous slug", () => {
    const superset = VILLAINOUS_ROSTERS[VILLAINOUS_BASE_SLUG];
    expect(villainsForGame(undefined)).toEqual(superset);
    expect(villainsForGame(null)).toEqual(superset);
    expect(villainsForGame("lost-cities")).toEqual(superset);
  });
});

describe("isVillainousSlug", () => {
  it("recognizes both boxes", () => {
    expect(isVillainousSlug(VILLAINOUS_BASE_SLUG)).toBe(true);
    expect(isVillainousSlug(VILLAINOUS_INTRO_SLUG)).toBe(true);
  });

  it("rejects other games and nullish input", () => {
    expect(isVillainousSlug("lovecraft-letter")).toBe(false);
    expect(isVillainousSlug(null)).toBe(false);
    expect(isVillainousSlug(undefined)).toBe(false);
  });

  // The old model stored the edition in `outcome.scenario`; the edition is now
  // the game itself. An edition label must never pass as a game slug.
  it("rejects a bare edition label", () => {
    expect(isVillainousSlug("Introduction to Evil")).toBe(false);
  });
});

describe("VILLAINOUS_ROSTERS", () => {
  it("Introduction to Evil is a strict subset of The Worst Takes it All", () => {
    const superset = new Set<string>(VILLAINOUS_ROSTERS[VILLAINOUS_BASE_SLUG]);
    for (const villain of VILLAINOUS_ROSTERS[VILLAINOUS_INTRO_SLUG]) {
      expect(superset.has(villain)).toBe(true);
    }
    expect(VILLAINOUS_ROSTERS[VILLAINOUS_INTRO_SLUG].length).toBeLessThan(superset.size);
  });
});
