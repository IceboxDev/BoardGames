import { describe, expect, it } from "vitest";
import {
  CatalogSlugListSchema,
  InventoryWriteResponseSchema,
  PendingInventorySchema,
  SetInventoryBodySchema,
  SetPendingInventoryBodySchema,
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

describe("CatalogSlugListSchema", () => {
  it("accepts slugs that name real catalog games", () => {
    expect(() => CatalogSlugListSchema.parse(["lost-cities", "set", "villainous"])).not.toThrow();
  });

  it("rejects a well-formed slug that names no game", () => {
    expect(() => CatalogSlugListSchema.parse(["not-a-real-game"])).toThrow();
  });

  // Both Villainous boxes are real, separately-ownable games (they seat 2-4 and
  // 2-6 respectively). The starter slug was stored in an inventory before it had
  // a catalog entry, so it silently resolved to nothing; it must resolve now.
  it("accepts both Villainous boxes", () => {
    expect(() =>
      CatalogSlugListSchema.parse(["villainous", "villainous-introduction-to-evil"]),
    ).not.toThrow();
  });

  it("reports the offending index and slug", () => {
    const result = CatalogSlugListSchema.safeParse(["set", "ghost-game"]);
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual([1]);
    expect(issue?.message).toContain("ghost-game");
  });

  it("still enforces slug shape and the 200 cap", () => {
    expect(() => CatalogSlugListSchema.parse(["Lost Cities"])).toThrow();
    expect(() => CatalogSlugListSchema.parse(Array.from({ length: 201 }, () => "set"))).toThrow();
  });
});

describe("SetInventoryBodySchema", () => {
  it("requires the slugs key", () => {
    expect(() => SetInventoryBodySchema.parse({})).toThrow();
    expect(() => SetInventoryBodySchema.parse({ slugs: ["set"] })).not.toThrow();
  });

  it("rejects an unknown slug on the write path", () => {
    expect(() => SetInventoryBodySchema.parse({ slugs: ["not-a-real-game"] })).toThrow();
  });
});

describe("pending inventory: strict write, lenient read", () => {
  it("rejects an unknown slug in the write body", () => {
    expect(() =>
      SetPendingInventoryBodySchema.parse({ slugs: ["not-a-real-game"], onlineMode: "offline" }),
    ).toThrow();
  });

  // The read schema parses whatever is already stored. A slug retired from the
  // catalog must not make an existing row unreadable.
  it("still parses a stored row holding a retired slug", () => {
    expect(() =>
      PendingInventorySchema.parse({ slugs: ["retired-game"], onlineMode: "offline" }),
    ).not.toThrow();
  });
});

describe("InventoryWriteResponseSchema", () => {
  it("requires both ok and slugs", () => {
    expect(() => InventoryWriteResponseSchema.parse({ ok: true, slugs: [] })).not.toThrow();
    expect(() => InventoryWriteResponseSchema.parse({ ok: true })).toThrow();
  });
});
