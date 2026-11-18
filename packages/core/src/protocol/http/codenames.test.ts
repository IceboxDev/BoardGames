import { describe, expect, it } from "vitest";
import { CodenamesScanRequestSchema, CodenamesScanResponseSchema } from "./codenames.ts";

type Cell = { word: string; sure: boolean; cover: string | null };
const cells = (n: number): Cell[] =>
  Array.from({ length: n }, (_, i) => ({ word: `W${i}`, sure: true, cover: null }));

describe("CodenamesScanRequestSchema", () => {
  it("accepts an image data URI", () => {
    expect(
      CodenamesScanRequestSchema.safeParse({ image: "data:image/jpeg;base64,/9j/4AAQ" }).success,
    ).toBe(true);
  });

  it("rejects anything that isn't an image", () => {
    const r = CodenamesScanRequestSchema.safeParse({ image: "data:text/plain;base64,aGk=" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["image"]);
  });
});

describe("CodenamesScanResponseSchema", () => {
  it("accepts a 25-card grid with German words and covers", () => {
    const grid = cells(25);
    grid[0] = { word: "GRÖSSE", sure: false, cover: null };
    grid[1] = { word: "", sure: true, cover: "red" };
    grid[2] = { word: "STRAẞE", sure: true, cover: "bystander" };
    const r = CodenamesScanResponseSchema.safeParse({ language: "de", cells: grid });
    expect(r.success).toBe(true);
  });

  it("rejects a grid that isn't 25 cards", () => {
    const r = CodenamesScanResponseSchema.safeParse({ language: "en", cells: cells(24) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["cells"]);
  });

  it("rejects an unknown cover", () => {
    const grid = cells(25);
    const r = CodenamesScanResponseSchema.safeParse({
      language: null,
      cells: [{ word: "X", sure: true, cover: "assassin" }, ...grid.slice(1)],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["cells", 0, "cover"]);
  });
});
