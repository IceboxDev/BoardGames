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

  it("returns the Villainous edition config (single, two editions)", () => {
    const config = variantConfigForSlug("villainous");
    expect(config?.label).toBe("Edition");
    expect(config?.mode).toBe("single");
    expect(config?.options.map((o) => o.value)).toEqual([
      "Introduction to Evil",
      "The Worst Takes It All",
    ]);
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
  });

  it("single-select games default to their first option", () => {
    expect(defaultVariantValue("the-resistance")).toBe("Standard");
    expect(defaultVariantValue("wavelength")).toBe("Standard");
    expect(defaultVariantValue("codenames")).toBe("English");
    expect(defaultVariantValue("villainous")).toBe("Introduction to Evil");
  });

  it("fixed single-option games default to that option", () => {
    expect(defaultVariantValue("bandit")).toBe("Standard");
  });

  it("multi-select games default only to a declared base, else undefined", () => {
    expect(defaultVariantValue("7-wonders")).toBe("Base");
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
