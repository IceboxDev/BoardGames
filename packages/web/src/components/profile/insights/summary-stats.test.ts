import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import {
  applyFilters,
  coPlayerCounts,
  monthlyBuckets,
  personalRecords,
  recordCounts,
  streaks,
} from "./summary-stats.ts";

let nextId = 1;
function item(overrides: Partial<ProfileMatchSummaryItem>): ProfileMatchSummaryItem {
  const id = nextId++;
  return {
    matchId: id,
    dateKey: "2026-07-10",
    playedAt: `2026-07-10T19:${String(id).padStart(2, "0")}:00Z`,
    gameSlug: "lost-cities",
    gameTitle: "Lost Cities",
    kind: "free-for-all",
    result: "win",
    credit: 1,
    place: 1,
    fieldSize: 2,
    score: null,
    sessions: 1,
    coPlayerIds: [],
    ...overrides,
  };
}

// Newest first, like the wire payload.
const newestFirst = (items: ProfileMatchSummaryItem[]) =>
  [...items].sort((a, b) => b.playedAt.localeCompare(a.playedAt));

describe("recordCounts", () => {
  it("splits wins / losses / other, with draws counted in other", () => {
    const counts = recordCounts([
      item({ result: "win" }),
      item({ result: "loss" }),
      item({ result: "draw" }),
      item({ result: "moderator" }),
      item({ result: "played" }),
    ]);
    expect(counts).toEqual({ total: 5, wins: 1, losses: 1, draws: 1, other: 3 });
  });
});

describe("streaks", () => {
  it("tracks the live run and the best win run", () => {
    // Chronological: W W L W W W → current 3W, best 3.
    const results = ["win", "win", "loss", "win", "win", "win"] as const;
    const items = newestFirst(
      results.map((r, i) =>
        item({ result: r, playedAt: `2026-07-${String(i + 1).padStart(2, "0")}T19:00:00Z` }),
      ),
    );
    expect(streaks(items)).toEqual({ current: { type: "win", length: 3 }, bestWin: 3 });
  });

  it("draws break streaks; moderator/played are transparent", () => {
    // Chronological: W W draw W ran W → draw resets, "ran" doesn't.
    const results = ["win", "win", "draw", "win", "moderator", "win"] as const;
    const items = newestFirst(
      results.map((r, i) =>
        item({ result: r, playedAt: `2026-07-${String(i + 1).padStart(2, "0")}T19:00:00Z` }),
      ),
    );
    expect(streaks(items)).toEqual({ current: { type: "win", length: 2 }, bestWin: 2 });
  });
});

describe("applyFilters", () => {
  const items = [
    item({ result: "win", gameSlug: "parks", playedAt: "2025-05-01T19:00:00Z" }),
    item({ result: "loss", gameSlug: "durak", playedAt: "2026-06-01T19:00:00Z" }),
    item({ result: "moderator", gameSlug: "parks", playedAt: "2026-07-01T19:00:00Z" }),
  ];

  it("filters by result bucket", () => {
    expect(applyFilters(items, { result: "won", year: null, gameSlug: null })).toHaveLength(1);
    expect(applyFilters(items, { result: "other", year: null, gameSlug: null })).toHaveLength(1);
  });

  it("filters by year and game independently", () => {
    expect(applyFilters(items, { result: "all", year: 2026, gameSlug: null })).toHaveLength(2);
    expect(applyFilters(items, { result: "all", year: null, gameSlug: "parks" })).toHaveLength(2);
  });
});

describe("monthlyBuckets", () => {
  it("buckets by month and fills gap months with zero columns", () => {
    const buckets = monthlyBuckets([
      item({ result: "win", playedAt: "2026-03-10T19:00:00Z" }),
      item({ result: "loss", playedAt: "2026-05-02T19:00:00Z" }),
      item({ result: "win", playedAt: "2026-05-20T19:00:00Z" }),
    ]);
    expect(buckets.map((b) => b.key)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(buckets[0]).toMatchObject({ wins: 1, losses: 0 });
    expect(buckets[1]).toMatchObject({ wins: 0, losses: 0, other: 0 });
    expect(buckets[2]).toMatchObject({ wins: 1, losses: 1 });
  });
});

describe("coPlayerCounts", () => {
  it("counts shared games and remembers the latest one", () => {
    const counts = coPlayerCounts([
      item({ coPlayerIds: ["a", "b"], playedAt: "2026-07-02T19:00:00Z" }),
      item({ coPlayerIds: ["a"], playedAt: "2026-07-01T19:00:00Z" }),
    ]);
    expect(counts[0]).toEqual({ userId: "a", games: 2, lastPlayedAt: "2026-07-02T19:00:00Z" });
    expect(counts[1]).toEqual({ userId: "b", games: 1, lastPlayedAt: "2026-07-02T19:00:00Z" });
  });
});

describe("personalRecords", () => {
  it("finds the biggest night and counts campaign sessions", () => {
    const records = personalRecords([
      item({ dateKey: "2026-07-10", sessions: 1 }),
      item({ dateKey: "2026-07-10", sessions: 3 }),
      item({ dateKey: "2026-06-01", sessions: 1, playedAt: "2026-06-01T19:00:00Z" }),
    ]);
    expect(records.biggestNight).toEqual({ dateKey: "2026-07-10", games: 2 });
    expect(records.totalSessions).toBe(5);
    expect(records.firstPlayedAt).toBe("2026-06-01T19:00:00Z");
  });
});
