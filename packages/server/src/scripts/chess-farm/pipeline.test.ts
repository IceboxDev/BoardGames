import { describe, expect, it } from "vitest";
import { handoverEstimate, nearlyDone } from "./pipeline.ts";

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

describe("the hand-over's exception", () => {
  it("lets only the last deep search within 2 depths of its target finish", () => {
    expect(nearlyDone(48, 50, 1)).toBe(true);
    expect(nearlyDone(49, 50, 1)).toBe(true);
    expect(nearlyDone(47, 50, 1)).toBe(false);
    expect(nearlyDone(38, 40, 1)).toBe(true);
    // Another deep search still to come, or none started yet: hand over.
    expect(nearlyDone(49, 50, 2)).toBe(false);
    expect(nearlyDone(0, 0, 1)).toBe(false);
  });
});
