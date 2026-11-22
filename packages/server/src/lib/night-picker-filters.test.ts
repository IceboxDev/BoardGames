import { describe, expect, it } from "vitest";
import { nightPickerExclusions, withoutExcluded } from "./night-picker-filters.ts";

const inputs = {
  nonDrinkers: new Set(["sober"]),
  ongoingCampaigns: new Set(["bomb-busters"]),
};

describe("nightPickerExclusions", () => {
  it("leaves drinking games out only while a non-drinker is coming", () => {
    const withSober = nightPickerExclusions(inputs, { sealed: false, peopleIds: ["a", "sober"] });
    expect(withSober.has("last-one-drunk")).toBe(true);
    expect(withSober.has("bomb-busters")).toBe(true);
    const without = nightPickerExclusions(inputs, { sealed: false, peopleIds: ["a"] });
    expect(without).toEqual(new Set(["bomb-busters"]));
  });

  it("changes nothing on a sealed night", () => {
    expect(nightPickerExclusions(inputs, { sealed: true, peopleIds: ["sober"] })).toEqual(
      new Set(),
    );
  });

  it("filters an owned set", () => {
    expect(withoutExcluded(["azul", "bomb-busters"], new Set(["bomb-busters"]))).toEqual(
      new Set(["azul"]),
    );
  });
});
