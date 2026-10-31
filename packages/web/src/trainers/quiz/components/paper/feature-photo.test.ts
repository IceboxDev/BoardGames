import { describe, expect, it } from "vitest";
import { floatBounds, photoSpans, pickFit } from "./feature-photo";

describe("photoSpans", () => {
  it("spans the column with a large landscape", () => {
    expect(photoSpans(1600, 1000)).toBe(true);
  });
  it("sets squarish photos, portraits and small files at the left", () => {
    expect(photoSpans(1200, 1000)).toBe(false);
    expect(photoSpans(800, 1400)).toBe(false);
    expect(photoSpans(600, 300)).toBe(false);
    expect(photoSpans(undefined, undefined)).toBe(false);
  });
});

describe("floatBounds", () => {
  it("allows up to half the column, preferring the file's own width", () => {
    expect(floatBounds(2000, 900)).toMatchObject({ max: 450, natural: 450 });
    expect(floatBounds(300, 900)).toMatchObject({ max: 450, natural: 300 });
  });
  it("keeps a floor, but never above the preferred width", () => {
    expect(floatBounds(2000, 900).min).toBeCloseTo(162);
    expect(floatBounds(100, 900).min).toBe(100);
  });
});

describe("pickFit", () => {
  const option = (width: number, trim: number) => ({ width, height: 100, trim });
  it("prefers the least trimmed fit", () => {
    expect(pickFit([option(300, 0.15), option(200, 0.02)], 300)?.width).toBe(200);
  });
  it("between equal trims, the one closest to the photo's own width", () => {
    expect(pickFit([option(150, 0.05), option(280, 0.05)], 300)?.width).toBe(280);
  });
  it("has no answer without a fit", () => {
    expect(pickFit([], 300)).toBeNull();
  });
});
