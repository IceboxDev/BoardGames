import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { summaryBadge } from "./summary-badge.ts";

function item(overrides: Partial<ProfileMatchSummaryItem>): ProfileMatchSummaryItem {
  return {
    matchId: 1,
    dateKey: "2026-07-10",
    playedAt: "2026-07-10T19:30:00Z",
    gameSlug: "7-wonders",
    gameTitle: "7 Wonders",
    kind: "free-for-all",
    result: "win",
    credit: 1,
    place: 1,
    fieldSize: 4,
    score: null,
    sessions: 1,
    coPlayerIds: [],
    ...overrides,
  };
}

describe("summaryBadge", () => {
  it("labels wins, draws, and moderator plays", () => {
    expect(summaryBadge(item({ result: "win" }))).toEqual({ label: "Won", tone: "emerald" });
    expect(summaryBadge(item({ result: "draw", place: null, fieldSize: null }))).toEqual({
      label: "Draw",
      tone: "neutral",
    });
    expect(summaryBadge(item({ result: "moderator" }))).toEqual({
      label: "Ran it",
      tone: "neutral",
    });
  });

  it("places free-for-all losses: middle = ordinal amber, last = red", () => {
    expect(summaryBadge(item({ result: "loss", place: 2, fieldSize: 4 }))).toEqual({
      label: "2nd",
      tone: "amber",
    });
    expect(summaryBadge(item({ result: "loss", place: 4, fieldSize: 4 }))).toEqual({
      label: "Last",
      tone: "rose",
    });
  });

  it("keeps point-less FFA losses a flat Lost (chess, Villainous)", () => {
    expect(
      summaryBadge(item({ result: "loss", gameSlug: "chess", place: 2, fieldSize: 2 })),
    ).toEqual({ label: "Lost", tone: "rose" });
  });

  it("shows scored co-ops as score / max, green only when perfect", () => {
    const base = { kind: "coop", result: "played", gameSlug: "just-one" } as const;
    expect(summaryBadge(item({ ...base, score: 9, place: null, fieldSize: null }))).toEqual({
      label: "9 / 13",
      tone: "amber",
    });
    expect(summaryBadge(item({ ...base, score: 13, place: null, fieldSize: null }))).toEqual({
      label: "13 / 13",
      tone: "emerald",
    });
  });

  it("labels an unresolved campaign session Ongoing", () => {
    expect(
      summaryBadge(
        item({ kind: "coop", result: "played", score: null, place: null, fieldSize: null }),
      ),
    ).toEqual({ label: "Ongoing", tone: "sky" });
  });
});
