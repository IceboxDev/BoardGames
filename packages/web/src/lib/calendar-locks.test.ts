import { LockedDateSchema } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { freeNightKey, nightsForDate } from "./calendar-locks";

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
