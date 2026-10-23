import { describe, expect, it } from "vitest";
import { handoverEstimate } from "./pipeline.ts";

describe("the heavy lane's backlog estimate", () => {
  it("doubles per depth still to go and counts the deep searches left", () => {
    const h = 3600_000;
    expect(handoverEstimate(12 * h, 40, 40, 1)).toBe(12);
    expect(handoverEstimate(12 * h, 37, 40, 1)).toBe(96);
    expect(handoverEstimate(12 * h, 47, 50, 3)).toBe(288);
    // A search that never reported a depth still ranks, if absurdly high.
    expect(handoverEstimate(12 * h, 0, 50, 1)).toBe(12 * 2 ** 30);
  });
});
