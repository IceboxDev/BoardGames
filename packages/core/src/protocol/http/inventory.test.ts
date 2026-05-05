import { describe, expect, it } from "vitest";
import {
  InventoryWriteResponseSchema,
  SetInventoryBodySchema,
  SlugListSchema,
} from "./inventory.ts";

describe("SlugListSchema", () => {
  it("accepts a list of kebab-case slugs", () => {
    expect(() => SlugListSchema.parse(["lost-cities", "set", "7-wonders"])).not.toThrow();
  });

  it("accepts an empty list", () => {
    expect(SlugListSchema.parse([])).toEqual([]);
  });

  it("rejects non-array input", () => {
    expect(() => SlugListSchema.parse("not an array")).toThrow();
  });

  it("rejects more than 200 entries", () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => `game-${i}`);
    expect(() => SlugListSchema.parse(tooMany)).toThrow();
  });

  it("rejects invalid slug shapes", () => {
    expect(() => SlugListSchema.parse(["Lost Cities"])).toThrow();
    expect(() => SlugListSchema.parse(["-leadingdash"])).toThrow();
  });
});

describe("SetInventoryBodySchema", () => {
  it("requires the slugs key", () => {
    expect(() => SetInventoryBodySchema.parse({})).toThrow();
    expect(() => SetInventoryBodySchema.parse({ slugs: ["set"] })).not.toThrow();
  });
});

describe("InventoryWriteResponseSchema", () => {
  it("requires both ok and slugs", () => {
    expect(() => InventoryWriteResponseSchema.parse({ ok: true, slugs: [] })).not.toThrow();
    expect(() => InventoryWriteResponseSchema.parse({ ok: true })).toThrow();
  });
});
