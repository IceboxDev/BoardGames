import { describe, expect, it } from "vitest";
import { squarify } from "./treemap";

describe("squarify", () => {
  it("fills the box with areas proportional to the values", () => {
    const rects = squarify([6, 6, 4, 3, 2, 2, 1, 0], (v) => v, 600, 400);
    expect(rects).toHaveLength(7);
    const total = rects.reduce((t, r) => t + r.w * r.h, 0);
    expect(total).toBeCloseTo(600 * 400, 3);
    for (const r of rects) {
      expect((r.w * r.h) / (600 * 400)).toBeCloseTo(r.item / 24, 5);
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it("lays the blocks below a size on their side, and only those", () => {
    const values = [40, 22, 12, 9, 7, 5, 4, 3, 3, 2, 2, 1];
    const plain = squarify(values, (v) => v, 1200, 900);
    const small = 1200 * 900 * (3.5 / 110);
    const wide = squarify(values, (v) => v, 1200, 900, small);
    const total = wide.reduce((t, r) => t + r.w * r.h, 0);
    expect(total).toBeCloseTo(1200 * 900, 3);
    const tall = (r: (typeof wide)[number]) => r.h > r.w * 1.05;
    expect(plain.filter((r) => r.item <= 3).some(tall)).toBe(true);
    expect(wide.filter((r) => r.item <= 3).some(tall)).toBe(false);
    // The big blocks keep the plain layout.
    expect(wide.slice(0, 6)).toEqual(plain.slice(0, 6));
  });

  it("returns nothing for an empty box or no values", () => {
    expect(squarify([1, 2], (v) => v, 0, 100)).toEqual([]);
    expect(squarify([0], (v) => v, 100, 100)).toEqual([]);
  });
});
