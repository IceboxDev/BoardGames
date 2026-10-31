import { CHARACTERS, editionOf } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { describe, expect, it } from "vitest";
import {
  charactersByCategory,
  clocktowerAlignment,
  clocktowerEditionFromLabel,
  clocktowerEditionLabel,
  clocktowerSetupProblems,
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

describe("clocktowerSetupProblems", () => {
  const tb8 = ["Undertaker", "Washerwoman", "Fortune Teller", "Monk", "Slayer"];

  it("accepts a roster that matches the setup sheet", () => {
    expect(clocktowerSetupProblems([...tb8, "Drunk", "Scarlet Woman", "Imp"])).toEqual([]);
  });

  it("asks about the Drunk when an Outsider is missing", () => {
    expect(clocktowerSetupProblems([...tb8, "Investigator", "Scarlet Woman", "Imp"])).toEqual([
      "6 Townsfolk and 0 Outsiders — 8 players start with 5 and 1. Was one of them the Drunk?",
    ]);
  });

  it("applies the Baron's +2 Outsiders", () => {
    const nine = ["Chef", "Empath", "Librarian", "Saint", "Recluse", "Drunk", "Butler"];
    expect(clocktowerSetupProblems([...nine, "Baron", "Imp"])).toEqual([]);
    expect(clocktowerSetupProblems([...nine, "Spy", "Imp"])).toEqual([
      "3 Townsfolk and 4 Outsiders — 9 players start with 5 and 2.",
    ]);
  });

  it("allows either Godfather adjustment", () => {
    const base = ["Grandmother", "Gossip", "Chambermaid", "Minstrel"];
    expect(clocktowerSetupProblems([...base, "Moonchild", "Godfather", "Shabaloth"])).toEqual([]);
  });

  it("flags a second Demon", () => {
    expect(clocktowerSetupProblems(["Chef", "Empath", "Monk", "Imp", "Imp"])).toEqual([
      "2 Demons — a game starts with 1. Record the character each player started as.",
      "0 Minions — 5 players start with 1.",
    ]);
  });

  it("stays quiet while roles are missing, and ignores Travellers", () => {
    expect(clocktowerSetupProblems([...tb8, undefined, "Scarlet Woman", "Imp"])).toEqual([]);
    expect(
      clocktowerSetupProblems([...tb8, "Drunk", "Scarlet Woman", "Imp", "Bureaucrat"]),
    ).toEqual([]);
  });
});

describe("edition labels", () => {
  it("round-trip through the stored scenario", () => {
    expect(clocktowerEditionFromLabel(clocktowerEditionLabel("bad-moon-rising"))).toBe(
      "bad-moon-rising",
    );
    expect(clocktowerEditionFromLabel("Standard")).toBeNull();
  });
});
