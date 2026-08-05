import type { MatchOutcome } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { groupMatchUnits, unitResult } from "./match-units.ts";

const p = (userId: string) => ({ userId, displayName: userId });

const session = (
  campaign: string,
  extra: { outcome?: "win" | "loss"; campaignResult?: "win" | "loss" } = {},
): MatchOutcome => ({
  kind: "coop",
  campaign,
  participants: [p("victor"), p("nicolo")],
  moderator: p("dm"),
  ...extra,
});

const row = (outcome: MatchOutcome, slug = "dungeons-and-dragons") => ({
  game_slug: slug,
  outcome_json: outcome,
});

describe("groupMatchUnits", () => {
  it("merges sessions of one campaign into a single unit, keeping others separate", () => {
    const units = groupMatchUnits([
      row(session("Wound of the Forest", { campaignResult: "win" })),
      row(session("Wound of the Forest", { outcome: "win" })),
      row({ kind: "coop", participants: [p("victor")], outcome: "loss" }, "pandemic"),
    ]);
    expect(units).toHaveLength(2);
    expect(units[0].sessions).toBe(2);
    expect(units[1].sessions).toBe(1);
  });

  it("elects the concluding session as the representative, in any order", () => {
    const concluding = row(session("Wound", { outcome: "win" }));
    const early = row(session("Wound", { campaignResult: "win" }));
    for (const order of [
      [early, concluding],
      [concluding, early],
    ]) {
      const units = groupMatchUnits(order);
      expect(units).toHaveLength(1);
      expect(units[0].rep).toBe(concluding);
    }
  });

  it("does not merge same-named campaigns across different games", () => {
    const units = groupMatchUnits([
      row(session("Wound"), "dungeons-and-dragons"),
      row(session("Wound"), "gloomhaven"),
    ]);
    expect(units).toHaveLength(2);
  });

  it("a campaign with no concluding session keeps its first session as rep", () => {
    const first = row(session("Open"));
    const units = groupMatchUnits([first, row(session("Open"))]);
    expect(units[0].rep).toBe(first);
    expect(units[0].sessions).toBe(2);
  });
});

describe("unitResult", () => {
  it("concluding session: player win with full credit, DM moderator", () => {
    const o = session("Wound", { outcome: "win" });
    expect(unitResult(o, "victor", false, "dungeons-and-dragons")).toEqual({
      result: "win",
      credit: 1,
    });
    expect(unitResult(o, "dm", false, "dungeons-and-dragons")).toEqual({
      result: "moderator",
      credit: null,
    });
  });

  it("missed finale: the back-filled campaignResult stands in", () => {
    const o = session("Wound", { campaignResult: "loss" });
    expect(unitResult(o, "victor", false, "dungeons-and-dragons")).toEqual({
      result: "loss",
      credit: 0,
    });
  });

  it("genuinely open campaign stays 'played' with no credit", () => {
    const o = session("Open");
    expect(unitResult(o, "victor", false, "dungeons-and-dragons")).toEqual({
      result: "played",
      credit: null,
    });
  });
});
