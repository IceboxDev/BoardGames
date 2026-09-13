import { REGIONS } from "@boardgames/core/games/senso-battle-for-japan/map";
import { describe, expect, it } from "vitest";
import {
  buildLayout,
  buildNode,
  CUBE,
  cubeSize,
  DEFAULT_PLACEMENTS,
  LAYOUTS,
  placementsToSource,
  SQUARE,
  stockNodeSize,
} from "./geometry";

describe("geometry", () => {
  it("has one placement per region in both orientations", () => {
    expect(DEFAULT_PLACEMENTS.landscape).toHaveLength(REGIONS.length);
    expect(DEFAULT_PLACEMENTS.portrait).toHaveLength(REGIONS.length);
    expect(LAYOUTS.landscape.nodes.map((n) => n.region)).toEqual(REGIONS.map((r) => r.id));
  });

  it("keeps the two viewBoxes as the painting's frame, one turned on its side", () => {
    expect(LAYOUTS.landscape.viewBox).toEqual({ x: 0, y: 0, width: 790, height: 445 });
    expect(LAYOUTS.portrait.viewBox).toEqual({ x: 0, y: 0, width: 445, height: 790 });
  });

  it("scales a card and everything on it uniformly", () => {
    const stock = buildNode(0, { x: 10, y: 20, scale: 1, arrangement: "column" });
    const half = buildNode(0, { x: 10, y: 20, scale: 0.5, arrangement: "column" });
    expect(half.bounds.w).toBeCloseTo(stock.bounds.w / 2);
    expect(half.bounds.h).toBeCloseTo(stock.bounds.h / 2);
    expect(half.squares[0]?.w).toBeCloseTo(SQUARE / 2);
    expect(half.badge.x - 10).toBeCloseTo((stock.badge.x - 10) / 2);
    expect(half.scale).toBe(0.5);
  });

  it("lays squares down the card in column and across it in row", () => {
    const col = buildNode(0, { x: 0, y: 0, scale: 1, arrangement: "column" });
    const row = buildNode(0, { x: 0, y: 0, scale: 1, arrangement: "row" });
    expect(new Set(col.squares.map((s) => s.x)).size).toBe(1);
    expect(new Set(row.squares.map((s) => s.y)).size).toBe(1);
    expect(stockNodeSize(3, "column").h).toBeGreaterThan(stockNodeSize(3, "row").h);
  });

  it("sizes cubes from their square so they follow the card's scale", () => {
    const layout = buildLayout("landscape", [
      ...DEFAULT_PLACEMENTS.landscape.slice(0, 9),
      { x: 0, y: 0, scale: 2, arrangement: "column" },
    ]);
    expect(cubeSize(layout, 9, 0)).toBeCloseTo(CUBE * 2);
    const stockScale = DEFAULT_PLACEMENTS.landscape[0]?.scale ?? 1;
    expect(cubeSize(layout, 0, 0)).toBeCloseTo(CUBE * stockScale);
  });

  it("prints the placements as the literal geometry.ts expects", () => {
    const src = placementsToSource("portrait", DEFAULT_PLACEMENTS.portrait);
    expect(src.startsWith("export const PORTRAIT_PLACEMENTS: readonly NodePlacement[] = [")).toBe(
      true,
    );
    expect(
      src.match(
        /\n {2}\{ x: \d+, y: \d+, scale: [\d.]+, arrangement: "(column|row)" \}, \/\/ \d+/g,
      ),
    ).toHaveLength(REGIONS.length);
    expect(src.trimEnd().endsWith("];")).toBe(true);
  });
});
