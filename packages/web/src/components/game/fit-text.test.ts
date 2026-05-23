import { describe, expect, it } from "vitest";
import { largestFontFittingAll } from "./fit-text";

const FONTS = [16, 15, 14, 13, 12, 11, 10] as const;

// Deterministic stand-in for real text measurement: estimate wrapped lines
// from characters-per-line at the given width, then height = lines × font ×
// 1.5. Smaller fonts fit more characters per line.
function fakeMeasure(width: number) {
  return (text: string, fontPx: number) => {
    const charsPerLine = Math.max(1, Math.floor(width / (fontPx * 0.5)));
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    return lines * fontPx * 1.5;
  };
}

const short = "x".repeat(220);
const mid = "x".repeat(285);
const long = "x".repeat(339);

describe("largestFontFittingAll", () => {
  const measure = fakeMeasure(330); // ~lg 3-col card body width

  it("returns the largest font when the box is roomy enough for all", () => {
    expect(largestFontFittingAll([short, mid, long], 10000, FONTS, measure)).toBe(16);
  });

  it("is driven by the worst-case (longest) text, not the shortest", () => {
    const target = 144;
    const all = largestFontFittingAll([short, mid, long], target, FONTS, measure);
    const longestOnly = largestFontFittingAll([long], target, FONTS, measure);
    // Adding shorter texts cannot raise the font above what the longest allows.
    expect(all).toBe(longestOnly);
    // And every text fits at the chosen size.
    for (const t of [short, mid, long]) expect(measure(t, all)).toBeLessThanOrEqual(target);
  });

  it("shrinks the uniform font as the box gets shorter", () => {
    const roomy = largestFontFittingAll([short, mid, long], 200, FONTS, measure);
    const tight = largestFontFittingAll([short, mid, long], 120, FONTS, measure);
    expect(tight).toBeLessThan(roomy);
  });

  it("shrinks the uniform font as the card gets narrower (smaller screens)", () => {
    const wide = largestFontFittingAll([short, mid, long], 144, FONTS, fakeMeasure(330));
    const narrow = largestFontFittingAll([short, mid, long], 144, FONTS, fakeMeasure(228));
    expect(narrow).toBeLessThan(wide);
  });

  it("falls back to the smallest font when nothing fits (paired with a grow-not-clip box)", () => {
    expect(largestFontFittingAll([long], 1, FONTS, measure)).toBe(10);
  });
});
