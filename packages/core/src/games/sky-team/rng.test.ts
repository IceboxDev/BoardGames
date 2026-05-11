import { describe, expect, it } from "vitest";
import { createRng, randomSeed, rollDie } from "./rng";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
  });

  it("returns values in [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("rollDie", () => {
  it("only ever returns 1..6", () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rollDie(r);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("covers all 6 faces given enough rolls", () => {
    const r = createRng(12345);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(rollDie(r));
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe("randomSeed", () => {
  it("returns a 32-bit unsigned integer", () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(0x100000000);
  });
});
