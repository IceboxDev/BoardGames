import { describe, expect, it } from "vitest";
import { cycleAvailability, dateKey, mapsEqual } from "./offline-availability";

describe("dateKey", () => {
  it("formats single-digit months and days with zero padding", () => {
    expect(dateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(dateKey(new Date(2026, 8, 9))).toBe("2026-09-09");
  });

  it("formats two-digit months and days without extra padding", () => {
    expect(dateKey(new Date(2026, 11, 25))).toBe("2026-12-25");
  });

  it("is keyed by local-time year/month/date (not UTC)", () => {
    // 2026-05-21 at 23:30 local time stays "2026-05-21" even if UTC has already rolled.
    const d = new Date(2026, 4, 21, 23, 30);
    expect(dateKey(d)).toBe("2026-05-21");
  });

  it("produces sortable keys (lexicographic == chronological)", () => {
    const keys = [
      dateKey(new Date(2026, 11, 31)),
      dateKey(new Date(2026, 0, 1)),
      dateKey(new Date(2026, 5, 15)),
    ];
    const sorted = [...keys].sort();
    expect(sorted).toEqual(["2026-01-01", "2026-06-15", "2026-12-31"]);
  });
});

describe("cycleAvailability", () => {
  it("undefined → can → maybe → undefined", () => {
    expect(cycleAvailability(undefined)).toBe("can");
    expect(cycleAvailability("can")).toBe("maybe");
    expect(cycleAvailability("maybe")).toBeUndefined();
  });

  it("a full cycle returns to the starting state", () => {
    let state: "can" | "maybe" | undefined;
    state = cycleAvailability(state);
    state = cycleAvailability(state);
    state = cycleAvailability(state);
    expect(state).toBeUndefined();
  });
});

describe("mapsEqual", () => {
  it("returns true for two empty maps", () => {
    expect(mapsEqual({}, {})).toBe(true);
  });

  it("returns true when both maps have identical key/value pairs", () => {
    expect(mapsEqual({ "2026-05-21": "can" }, { "2026-05-21": "can" })).toBe(true);
    expect(mapsEqual({ a: "can", b: "maybe" }, { b: "maybe", a: "can" })).toBe(true);
  });

  it("returns false when sizes differ", () => {
    expect(mapsEqual({ a: "can" }, {})).toBe(false);
    expect(mapsEqual({ a: "can" }, { a: "can", b: "maybe" })).toBe(false);
  });

  it("returns false when any value differs", () => {
    expect(mapsEqual({ a: "can" }, { a: "maybe" })).toBe(false);
  });

  it("returns false when keys differ (same length)", () => {
    expect(mapsEqual({ a: "can" }, { b: "can" })).toBe(false);
  });
});
