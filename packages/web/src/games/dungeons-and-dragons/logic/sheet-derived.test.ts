import type { CharacterSheet } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import {
  fmt,
  mod,
  modOrZero,
  passivePerception,
  proficiencyBonus,
  shortSpeed,
} from "./sheet-derived";

// These four derivations were re-implemented inline in CharacterSheetModal,
// NpcSheetModal, and InitiativePanel. Pinning them here before those three
// were rewired onto this module.

describe("mod", () => {
  it("follows the 5e table", () => {
    expect(mod(1)).toBe(-5);
    expect(mod(8)).toBe(-1);
    expect(mod(9)).toBe(-1); // rounds toward -inf, not toward zero
    expect(mod(10)).toBe(0);
    expect(mod(11)).toBe(0);
    expect(mod(20)).toBe(5);
    expect(mod(30)).toBe(10);
  });
});

describe("modOrZero", () => {
  it("matches mod for a real score", () => {
    expect(modOrZero(20)).toBe(5);
    expect(modOrZero(8)).toBe(-1);
  });

  // The guard InitiativePanel's `dexMod` carried and `mod` does not.
  it("returns 0 for a missing score rather than throwing or coercing", () => {
    expect(modOrZero(null)).toBe(0);
    expect(modOrZero(undefined)).toBe(0);
  });

  it("does not treat 0 as missing", () => {
    expect(modOrZero(0)).toBe(-5);
  });
});

describe("fmt", () => {
  it("signs the modifier", () => {
    expect(fmt(3)).toBe("+3");
    expect(fmt(0)).toBe("+0");
    expect(fmt(-2)).toBe("-2");
  });
});

describe("proficiencyBonus", () => {
  it("steps every four levels", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(9)).toBe(4);
    expect(proficiencyBonus(17)).toBe(6);
    expect(proficiencyBonus(20)).toBe(6);
  });

  it("is null for an unknown level", () => {
    expect(proficiencyBonus(null)).toBeNull();
  });
});

function sheet(over: Partial<CharacterSheet>): CharacterSheet {
  return { skills: [], abilities: null, ...over } as CharacterSheet;
}

describe("passivePerception", () => {
  // The whole point of the helper: the Perception SKILL modifier already
  // carries proficiency, so it must not be re-derived from WIS.
  it("prefers the Perception skill modifier (which carries proficiency)", () => {
    const s = sheet({
      skills: [{ name: "Perception", modifier: 4, proficiency: "proficient" }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    });
    expect(passivePerception(s)).toBe(14);
  });

  it("falls back to 10 + WIS mod when the skill list is empty", () => {
    const s = sheet({
      skills: [],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 },
    });
    expect(passivePerception(s)).toBe(13);
  });

  it("is null when there is neither a skill nor an ability block", () => {
    expect(passivePerception(sheet({ skills: [], abilities: null }))).toBeNull();
  });
});

describe("shortSpeed", () => {
  it("strips the unit and parenthetical", () => {
    expect(shortSpeed("30 ft. (walking)")).toBe("30");
    expect(shortSpeed("25 feet")).toBe("25");
    expect(shortSpeed("30")).toBe("30");
  });
});
