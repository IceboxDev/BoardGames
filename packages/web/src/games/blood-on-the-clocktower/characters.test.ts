import { CHARACTERS, editionOf } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { describe, expect, it } from "vitest";
import {
  charactersByCategory,
  clocktowerAlignment,
  detectClocktowerEdition,
  findClocktowerCharacter,
  isFabled,
} from "./characters";

describe("the match-history catalog agrees with the companion's", () => {
  it("every companion character resolves by the exact name it writes into `role`", () => {
    for (const c of Object.values(CHARACTERS)) {
      const found = findClocktowerCharacter(c.name);
      expect(found, c.name).not.toBeNull();
      expect(found?.category, c.name).toBe(c.type);
      expect(found?.edition, c.name).toBe(editionOf(c.id));
    }
  });

  it("derives the alignment the companion would have recorded", () => {
    for (const c of Object.values(CHARACTERS)) {
      const expected =
        c.type === "traveller" ? null : c.type === "minion" || c.type === "demon" ? "evil" : "good";
      expect(clocktowerAlignment(c.type), c.name).toBe(expected);
    }
  });

  it("lists the derived editions in the companion's sheet order, fully", () => {
    const tb = charactersByCategory("trouble-brewing").flatMap((g) => g.names);
    const bmr = charactersByCategory("bad-moon-rising").flatMap((g) => g.names);
    const coreTb = Object.values(CHARACTERS)
      .filter((c) => editionOf(c.id) === "trouble-brewing")
      .map((c) => c.name);
    const coreBmr = Object.values(CHARACTERS)
      .filter((c) => editionOf(c.id) === "bad-moon-rising")
      .map((c) => c.name);
    expect([...tb].sort()).toEqual([...coreTb].sort());
    expect([...bmr].sort()).toEqual([...coreBmr].sort());
    expect(detectClocktowerEdition(bmr.slice(0, 3))).toBe("bad-moon-rising");
  });

  it("keeps Sects & Violets and the Fabled hand-written until core knows them", () => {
    expect(findClocktowerCharacter("Vortox")).toEqual({
      name: "Vortox",
      edition: "sects-and-violets",
      category: "demon",
    });
    expect(isFabled("Djinn")).toBe(true);
    expect(findClocktowerCharacter("Djinn")).toBeNull();
  });
});
