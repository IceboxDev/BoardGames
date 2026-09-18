import { LockedDateSchema } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { freeNightKey, nightsForDate, sortHostCandidates } from "./calendar-locks";

const lock = LockedDateSchema.parse({
  lockedBy: "u-admin",
  lockedAt: "2026-09-10 12:00:00",
  expectedUserIds: [],
  rsvps: {},
  host: null,
  eventTime: null,
  address: null,
  picksLockedAt: null,
  attendance: { definite: 0, tentative: 0 },
});

describe("nightsForDate", () => {
  it("lists a date's nights first slot first, skipping empty slots", () => {
    expect(nightsForDate(undefined, "2026-09-20")).toEqual([]);
    expect(nightsForDate({}, "2026-09-20")).toEqual([]);
    const one = nightsForDate({ "2026-09-20": lock }, "2026-09-20");
    expect(one.map((n) => [n.key, n.slot])).toEqual([["2026-09-20", 1]]);
    const secondOnly = nightsForDate({ "2026-09-20_2": lock }, "2026-09-20");
    expect(secondOnly.map((n) => [n.key, n.slot])).toEqual([["2026-09-20_2", 2]]);
    const both = nightsForDate(
      { "2026-09-20_2": lock, "2026-09-20": lock, "2026-09-21": lock },
      "2026-09-20",
    );
    expect(both.map((n) => n.key)).toEqual(["2026-09-20", "2026-09-20_2"]);
  });
});

describe("freeNightKey", () => {
  it("offers the first empty slot and nothing when the date is full", () => {
    expect(freeNightKey(undefined, "2026-09-20")).toBe("2026-09-20");
    expect(freeNightKey({ "2026-09-20": lock }, "2026-09-20")).toBe("2026-09-20_2");
    expect(freeNightKey({ "2026-09-20_2": lock }, "2026-09-20")).toBe("2026-09-20");
    expect(freeNightKey({ "2026-09-20": lock, "2026-09-20_2": lock }, "2026-09-20")).toBeNull();
  });
});

describe("sortHostCandidates", () => {
  const names = (list: { name: string }[]) => list.map((c) => c.name);
  const candidates = [
    { userId: "u-9", name: "Mantas" },
    { userId: "u-0a", name: "Tristan" },
    { userId: "u-3", name: "Jaqueline" },
    { userId: "u-0b", name: "Aydan" },
    { userId: "u-2-old", name: "Nicolo" },
    { userId: "u-2-new", name: "Simon" },
    { userId: "u-4", name: "Maximilian" },
  ];
  const stats = {
    "u-9": { totalHosts: 9, lastHostedDate: "2026-09-29" },
    "u-3": { totalHosts: 3, lastHostedDate: "2026-09-18" },
    "u-2-old": { totalHosts: 2, lastHostedDate: "2026-07-16" },
    "u-2-new": { totalHosts: 2, lastHostedDate: "2026-09-10" },
    "u-4": { totalHosts: 4, lastHostedDate: "2026-09-24" },
    "u-0b": { totalHosts: 0, lastHostedDate: null },
  };

  it("puts the fewest hosts first, the most recent host first among equals, then by name", () => {
    expect(names(sortHostCandidates(candidates, stats))).toEqual([
      "Aydan",
      "Tristan",
      "Simon",
      "Nicolo",
      "Jaqueline",
      "Maximilian",
      "Mantas",
    ]);
  });

  it("falls back to name order without stats and leaves the input untouched", () => {
    const input = [...candidates];
    expect(names(sortHostCandidates(input, null))).toEqual([
      "Aydan",
      "Jaqueline",
      "Mantas",
      "Maximilian",
      "Nicolo",
      "Simon",
      "Tristan",
    ]);
    expect(input).toEqual(candidates);
  });
});
