import { describe, expect, it } from "vitest";
import { lowScoreWinsForSlug } from "./score-config";

describe("lowScoreWinsForSlug", () => {
  it("returns false for null slug", () => {
    expect(lowScoreWinsForSlug(null)).toBe(false);
  });

  it("returns false for slugs not in the inverted-scoring set", () => {
    expect(lowScoreWinsForSlug("lost-cities")).toBe(false);
    expect(lowScoreWinsForSlug("sky-team")).toBe(false);
  });

  it("returns true for Phase 10 (penalty scoring — lowest wins)", () => {
    expect(lowScoreWinsForSlug("phase-10")).toBe(true);
  });
});
