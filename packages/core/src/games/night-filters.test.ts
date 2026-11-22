import { describe, expect, it } from "vitest";
import { isDrinkingGame, ongoingCampaignSlugs, pickerExclusions } from "./night-filters.ts";

const P9 = "the-crew-quest-for-planet-nine";
const SEA = "the-crew-mission-deep-sea";
const BB = "bomb-busters";

describe("ongoingCampaignSlugs", () => {
  it("is empty before any campaign match", () => {
    expect(ongoingCampaignSlugs([{ slug: "azul", scenario: null, won: true }])).toEqual(new Set());
  });

  it("hides every box of a family once one of them has started", () => {
    const out = ongoingCampaignSlugs([{ slug: P9, scenario: "#1 Teambuilding", won: true }]);
    expect(out).toEqual(new Set([P9, SEA]));
  });

  it("ends a family only on a won finale mission", () => {
    const lostFinale = { slug: SEA, scenario: "#32 Finale", won: false };
    const wonFinale = { slug: SEA, scenario: "#32 Finale", won: true };
    const p9 = { slug: P9, scenario: "#50 Homeward", won: true };
    expect(ongoingCampaignSlugs([p9, lostFinale]).has(P9)).toBe(true);
    expect(ongoingCampaignSlugs([p9, lostFinale, wonFinale])).toEqual(new Set());
    // Planet Nine's own last mission doesn't end The Crew: Deep Sea continues it.
    expect(ongoingCampaignSlugs([p9]).has(SEA)).toBe(true);
    // #3 is not #32.
    expect(ongoingCampaignSlugs([{ slug: SEA, scenario: "#3 x", won: true }]).size).toBe(2);
  });

  it("tracks families separately", () => {
    const out = ongoingCampaignSlugs([{ slug: BB, scenario: "#4 Training", won: false }]);
    expect(out).toEqual(new Set([BB]));
  });
});

describe("pickerExclusions", () => {
  it("adds the drinking games only when a non-drinker is coming", () => {
    expect(isDrinkingGame("last-one-drunk")).toBe(true);
    expect(isDrinkingGame("not-enough-mana")).toBe(true);
    expect(isDrinkingGame("azul")).toBe(false);
    const ongoing = new Set([BB]);
    expect(pickerExclusions({ nonDrinkerComing: false, ongoingCampaigns: ongoing })).toEqual(
      new Set([BB]),
    );
    expect(pickerExclusions({ nonDrinkerComing: true, ongoingCampaigns: ongoing })).toEqual(
      new Set([BB, "last-one-drunk", "not-enough-mana"]),
    );
  });
});
