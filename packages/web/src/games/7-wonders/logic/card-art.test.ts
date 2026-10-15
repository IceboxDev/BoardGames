import { CARDS as BASE, GUILDS } from "@boardgames/core/games/7-wonders/cards";
import { describe, expect, it } from "vitest";
import { FULL_CELL, NO_ART, SHEET, SPRITE_CELL, spriteGeometry, spriteStyle } from "./card-art";

const CARDS = [...BASE, ...GUILDS];
/** The illustration below the printed band. */
const ART_REGION = { x: 0, y: 110, w: SHEET.cellW, h: SHEET.cellH - 110 };

describe("7 Wonders card art", () => {
  it("has a cell for every card except the declared fallbacks", () => {
    const names = [...new Set(CARDS.map((c) => c.name))];
    const missing = names.filter((n) => SPRITE_CELL[n] === undefined);
    expect(missing.sort()).toEqual([...NO_ART].sort());
  });

  it("maps only real cards, each to its own cell inside the sheet", () => {
    const names = new Set(CARDS.map((c) => c.name));
    for (const name of Object.keys(SPRITE_CELL)) expect(names.has(name)).toBe(true);
    const cells = Object.values(SPRITE_CELL);
    expect(new Set(cells).size).toBe(cells.length);
    for (const c of cells) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(SHEET.cols * SHEET.rows);
    }
  });

  it("covers the box with the region, centred", () => {
    for (const cell of [0, 9, 40, 73, 76]) {
      for (const [aspect, region] of [
        [2 / 3, FULL_CELL],
        [0.9, ART_REGION],
        [1.4, ART_REGION],
      ] as const) {
        const { placed } = spriteGeometry(cell, aspect, region);
        const boxH = 1 / aspect;
        // Covers the box…
        expect(placed.left).toBeLessThanOrEqual(1e-9);
        expect(placed.top).toBeLessThanOrEqual(1e-9);
        expect(placed.left + placed.width).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(placed.top + placed.height).toBeGreaterThanOrEqual(boxH - 1e-9);
        // …centred on both axes.
        expect(placed.left + placed.width / 2).toBeCloseTo(0.5, 9);
        expect(placed.top + placed.height / 2).toBeCloseTo(boxH / 2, 9);
      }
    }
  });

  it("shows a whole cell at its own aspect with nothing cropped", () => {
    const { placed, x, y } = spriteGeometry(55, SHEET.cellW / SHEET.cellH, FULL_CELL);
    expect(placed.left).toBeCloseTo(0, 9);
    expect(placed.top).toBeCloseTo(0, 9);
    expect(x).toBeCloseTo((5 / 9) * 100, 9);
    expect(y).toBeCloseTo((5 / 7) * 100, 9);
  });

  it("selects the column by percentage", () => {
    expect(spriteStyle(0).backgroundPosition).toMatch(/^0% /);
    expect(spriteStyle(9, SHEET.cellW / SHEET.cellH).backgroundPosition).toMatch(/^100% /);
  });
});
