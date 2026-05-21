import type { GameRecord } from "@boardgames/core/games/set/types";
import { describe, expect, it } from "vitest";
import {
  clearHistory,
  computePersonalBests,
  findUnsyncedRecords,
  loadGameHistory,
  mergeHistories,
  saveFullHistory,
  saveGameRecord,
} from "./persistence";

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  // The local-history path stores everything it gets back; we don't need to
  // construct a fully-faithful GameRecord — only the fields the pure
  // computations under test actually touch.
  return {
    id: "g1",
    timestamp: 1_700_000_000_000,
    rating: 1500,
    netScore: 0,
    avgFindTimeMs: 0,
    fastestSetMs: 0,
    accuracy: 0,
    throughput: 0,
    longestStreak: 0,
    durationMs: 0,
    ...overrides,
  } as GameRecord;
}

describe("mergeHistories", () => {
  it("returns an empty array when both sides are empty", () => {
    expect(mergeHistories([], [])).toEqual([]);
  });

  it("local entries take precedence over remote entries with the same id", () => {
    const local = [record({ id: "g1", rating: 1700 })];
    const remote = [record({ id: "g1", rating: 1500 })];
    const merged = mergeHistories(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].rating).toBe(1700);
  });

  it("adds remote-only entries to the merged list", () => {
    const local = [record({ id: "a", timestamp: 1 })];
    const remote = [record({ id: "b", timestamp: 2 })];
    const merged = mergeHistories(local, remote);
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sorts the merged list chronologically by timestamp", () => {
    const local = [record({ id: "later", timestamp: 200 })];
    const remote = [record({ id: "earlier", timestamp: 100 })];
    const merged = mergeHistories(local, remote);
    expect(merged.map((r) => r.id)).toEqual(["earlier", "later"]);
  });
});

describe("findUnsyncedRecords", () => {
  it("returns local entries whose id is not present in the remote set", () => {
    const local = [record({ id: "synced" }), record({ id: "new-1" }), record({ id: "new-2" })];
    const remote = [record({ id: "synced" })];
    const unsynced = findUnsyncedRecords(local, remote);
    expect(unsynced.map((r) => r.id)).toEqual(["new-1", "new-2"]);
  });

  it("returns [] when every local entry has a remote twin", () => {
    const local = [record({ id: "a" }), record({ id: "b" })];
    const remote = [record({ id: "a" }), record({ id: "b" })];
    expect(findUnsyncedRecords(local, remote)).toEqual([]);
  });
});

describe("computePersonalBests", () => {
  it("returns an empty object for an empty history", () => {
    expect(computePersonalBests([])).toEqual({});
  });

  it("computes max for win-style stats and min for time-style stats", () => {
    const history = [
      record({
        rating: 1500,
        netScore: 10,
        accuracy: 0.8,
        throughput: 30,
        longestStreak: 5,
        avgFindTimeMs: 1500,
        fastestSetMs: 800,
        durationMs: 60_000,
      }),
      record({
        id: "g2",
        rating: 1700, // new max
        netScore: 5,
        accuracy: 0.95, // new max
        throughput: 50, // new max
        longestStreak: 3,
        avgFindTimeMs: 1000, // new min
        fastestSetMs: 500, // new min
        durationMs: 45_000, // new min
      }),
    ];
    const bests = computePersonalBests(history);
    expect(bests.bestRating).toBe(1700);
    expect(bests.bestNetScore).toBe(10);
    expect(bests.bestAccuracy).toBeCloseTo(0.95);
    expect(bests.bestThroughput).toBe(50);
    expect(bests.longestStreak).toBe(5);
    expect(bests.fastestAvgFindTime).toBe(1000);
    expect(bests.fastestSingleSet).toBe(500);
    expect(bests.shortestGame).toBe(45_000);
  });

  it("excludes zero / sentinel values from min computations", () => {
    // The pure code filters > 0 for the time-based min stats — verify a
    // zero entry doesn't poison fastestSetMs / fastestAvgFindTime / shortestGame.
    const history = [
      record({ avgFindTimeMs: 0, fastestSetMs: 0, durationMs: 0 }),
      record({ id: "g2", avgFindTimeMs: 2000, fastestSetMs: 700, durationMs: 30_000 }),
    ];
    const bests = computePersonalBests(history);
    expect(bests.fastestAvgFindTime).toBe(2000);
    expect(bests.fastestSingleSet).toBe(700);
    expect(bests.shortestGame).toBe(30_000);
  });
});

describe("localStorage CRUD", () => {
  it("saveGameRecord appends to an empty list", () => {
    saveGameRecord(record({ id: "first" }));
    expect(loadGameHistory().map((r) => r.id)).toEqual(["first"]);
  });

  it("saveFullHistory replaces whatever was stored", () => {
    saveGameRecord(record({ id: "old" }));
    saveFullHistory([record({ id: "new" })]);
    expect(loadGameHistory().map((r) => r.id)).toEqual(["new"]);
  });

  it("clearHistory wipes the store", () => {
    saveGameRecord(record({ id: "a" }));
    clearHistory();
    expect(loadGameHistory()).toEqual([]);
  });

  it("loadGameHistory returns [] when localStorage is empty", () => {
    expect(loadGameHistory()).toEqual([]);
  });

  it("loadGameHistory returns [] on malformed JSON instead of throwing", () => {
    window.localStorage.setItem("set-game-history-v3", "{not json");
    expect(loadGameHistory()).toEqual([]);
  });
});
