import { describe, expect, it } from "vitest";
import { awardLabel, awardPoints, awardsForSlug, PUBLISH_OR_PERISH_SLUG } from "./awards.ts";

describe("awards", () => {
  it("defines the three Publish or Perish awards with their bonus points", () => {
    const defs = awardsForSlug(PUBLISH_OR_PERISH_SLUG);
    expect(defs.map((a) => [a.id, a.points])).toEqual([
      ["snarkiest-reviewer", 3],
      ["theoretical-innovation", 3],
      ["almost-there", 2.9],
    ]);
    expect(awardsForSlug("chess")).toEqual([]);
    expect(awardsForSlug(null)).toEqual([]);
  });

  it("sums a player's award points, ignoring unknown ids", () => {
    expect(awardPoints(PUBLISH_OR_PERISH_SLUG, ["snarkiest-reviewer", "almost-there"])).toBeCloseTo(
      5.9,
      10,
    );
    expect(awardPoints(PUBLISH_OR_PERISH_SLUG, ["nobel-prize"])).toBe(0);
    expect(awardPoints(PUBLISH_OR_PERISH_SLUG, undefined)).toBe(0);
    expect(awardPoints("chess", ["snarkiest-reviewer"])).toBe(0);
  });

  it("labels known ids and echoes unknown ones", () => {
    expect(awardLabel(PUBLISH_OR_PERISH_SLUG, "almost-there")).toBe("Almost There");
    expect(awardLabel(PUBLISH_OR_PERISH_SLUG, "mystery")).toBe("mystery");
  });
});
