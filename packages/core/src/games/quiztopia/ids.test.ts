import { describe, expect, it } from "vitest";
import { hashSeed } from "../../lib/rng.ts";
import { cardRef, deckCardRefs, parseCardRef, virtualCardRefs } from "./ids.ts";

describe("card refs", () => {
  it("builds and parses printed and virtual refs", () => {
    expect(cardRef("c042", 0)).toBe("c042");
    expect(cardRef("c042", 3)).toBe("c042-v3");
    expect(parseCardRef("c042")).toEqual({ cardId: "c042", k: 0 });
    expect(parseCardRef("c042-v4")).toEqual({ cardId: "c042", k: 4 });
    expect(parseCardRef("c042-v5")).toBeNull();
    expect(parseCardRef("x042")).toBeNull();
    expect(() => cardRef("c042", 5)).toThrow();
    expect(() => cardRef("bad", 0)).toThrow();
  });

  it("derives four virtual cards per card and an extended deck five times the size", () => {
    expect(virtualCardRefs(["c001", "c002"])).toEqual([
      "c001-v1",
      "c002-v1",
      "c001-v2",
      "c002-v2",
      "c001-v3",
      "c002-v3",
      "c001-v4",
      "c002-v4",
    ]);
    expect(deckCardRefs(["c001"], "original")).toEqual(["c001"]);
    expect(deckCardRefs(["c001", "c002"], "extended")).toHaveLength(10);
  });

  it("hashes text to a 32-bit seed deterministically", () => {
    expect(hashSeed("u1:3")).toBe(hashSeed("u1:3"));
    expect(hashSeed("u1:3")).not.toBe(hashSeed("u1:4"));
    expect(hashSeed("x")).toBeGreaterThanOrEqual(0);
  });
});
