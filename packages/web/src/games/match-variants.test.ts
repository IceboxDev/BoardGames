import { describe, expect, it } from "vitest";
import {
  defaultVariantValue,
  joinMultiVariant,
  parseMultiVariant,
  variantConfigForSlug,
} from "./match-variants";

describe("variantConfigForSlug", () => {
  it("returns null for null or unknown slug", () => {
    expect(variantConfigForSlug(null)).toBeNull();
    expect(variantConfigForSlug("not-a-real-game")).toBeNull();
  });

  it("returns the Codenames language config (single-select, English/German)", () => {
    const config = variantConfigForSlug("codenames");
    expect(config?.label).toBe("Language");
    expect(config?.mode).toBe("single");
    expect(config?.options.map((o) => o.value)).toEqual(["English", "German"]);
  });

  it("returns the 7 Wonders edition config (multi-select)", () => {
    const config = variantConfigForSlug("7-wonders");
    expect(config?.mode).toBe("multi");
    expect(config?.options.length).toBeGreaterThanOrEqual(2);
  });

  it("returns the Phase 10 ruleset config (single, five variants)", () => {
    const config = variantConfigForSlug("phase-10");
    expect(config?.mode).toBe("single");
    expect(config?.options.length).toBe(5);
  });

  // Villainous has no edition picker: each box is its own catalog game, so the
  // chosen game already names the edition.
  it("returns no config for either Villainous box", () => {
    expect(variantConfigForSlug("villainous")).toBeNull();
    expect(variantConfigForSlug("villainous-introduction-to-evil")).toBeNull();
  });

  it("returns the Dungeon Mayhem sets config (multi-select, three sets)", () => {
    const config = variantConfigForSlug("dungeon-mayhem");
    expect(config?.label).toBe("Sets in play");
    expect(config?.mode).toBe("multi");
    expect(config?.options.map((o) => o.value)).toEqual([
      "Standard",
      "Battle for Baldur's Gate",
      "Monster Madness",
    ]);
  });

  it("returns the Lovecraft Letter edition config (fixed Standard)", () => {
    const config = variantConfigForSlug("lovecraft-letter");
    expect(config?.label).toBe("Edition");
    expect(config?.fixed).toBe(true);
    expect(config?.options.map((o) => o.value)).toEqual(["Standard"]);
  });

  it("returns the Just One mode config (single, Standard / Discardless)", () => {
    const config = variantConfigForSlug("just-one");
    expect(config?.label).toBe("Mode");
    expect(config?.mode).toBe("single");
    expect(config?.options.map((o) => o.value)).toEqual(["Standard", "Discardless"]);
  });

  it("returns the Resistance edition config (single, Standard / The Plot Thickens)", () => {
    const config = variantConfigForSlug("the-resistance");
    expect(config?.label).toBe("Edition");
    expect(config?.mode).toBe("single");
    expect(config?.options.map((o) => o.value)).toEqual(["Standard", "The Plot Thickens"]);
  });
});

describe("defaultVariantValue", () => {
  it("returns undefined for a game with no variants", () => {
    expect(defaultVariantValue(null)).toBeUndefined();
    expect(defaultVariantValue("not-a-real-game")).toBeUndefined();
    expect(defaultVariantValue("villainous")).toBeUndefined();
  });

  it("single-select games default to their first option", () => {
    expect(defaultVariantValue("the-resistance")).toBe("Standard");
    expect(defaultVariantValue("wavelength")).toBe("Standard");
    expect(defaultVariantValue("codenames")).toBe("English");
    expect(defaultVariantValue("just-one")).toBe("Standard");
  });

  it("fixed single-option games default to that option", () => {
    expect(defaultVariantValue("bandit")).toBe("Standard");
    expect(defaultVariantValue("lovecraft-letter")).toBe("Standard");
  });

  it("multi-select games default only to a declared base, else undefined", () => {
    expect(defaultVariantValue("7-wonders")).toBe("Base");
    expect(defaultVariantValue("dungeon-mayhem")).toBe("Standard");
    expect(defaultVariantValue("exploding-kittens")).toBeUndefined();
  });
});

describe("parseMultiVariant", () => {
  it("returns [] for undefined or empty string", () => {
    expect(parseMultiVariant(undefined)).toEqual([]);
    expect(parseMultiVariant("")).toEqual([]);
  });

  it('splits on " + " and trims surrounding whitespace', () => {
    expect(parseMultiVariant("Base + Leaders + Cities")).toEqual(["Base", "Leaders", "Cities"]);
    expect(parseMultiVariant(" Base   +   Leaders ")).toEqual(["Base", "Leaders"]);
  });

  it("drops empty fragments from accidental double-joins", () => {
    expect(parseMultiVariant("Base +  + Cities")).toEqual(["Base", "Cities"]);
  });
});

describe("joinMultiVariant", () => {
  const options = variantConfigForSlug("7-wonders");
  if (!options) throw new Error("7-wonders config missing");
  const opts = options.options;

  it("returns undefined when nothing is selected", () => {
    expect(joinMultiVariant([], opts)).toBeUndefined();
  });

  it("emits selected values in catalog order regardless of input order", () => {
    expect(joinMultiVariant(["Cities", "Base", "Leaders"], opts)).toBe("Base + Leaders + Cities");
  });

  it("silently drops selected values that are not in the catalog", () => {
    expect(joinMultiVariant(["Base", "Made-Up-Expansion"], opts)).toBe("Base");
  });

  it("is the inverse of parseMultiVariant for catalog values", () => {
    const stored = joinMultiVariant(["Base", "Leaders"], opts);
    expect(stored).toBeDefined();
    expect(parseMultiVariant(stored)).toEqual(["Base", "Leaders"]);
  });
});
