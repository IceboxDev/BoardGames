import { describe, expect, it } from "vitest";
import { build42Days, startOfWeekMonday } from "./offline-week";

describe("startOfWeekMonday", () => {
  it("returns Monday for every day of a known week", () => {
    // Monday 2026-05-18 through Sunday 2026-05-24 — all should resolve to 2026-05-18.
    const expected = new Date(2026, 4, 18).getTime();
    for (let day = 18; day <= 24; day++) {
      const input = new Date(2026, 4, day);
      const got = startOfWeekMonday(input);
      expect(got.getTime()).toBe(expected);
    }
  });

  it("rolls back across a month boundary", () => {
    // 2026-06-01 is Monday; 2026-05-31 (Sun) should resolve to 2026-05-25.
    expect(startOfWeekMonday(new Date(2026, 5, 1)).getTime()).toBe(new Date(2026, 5, 1).getTime());
    expect(startOfWeekMonday(new Date(2026, 4, 31)).getTime()).toBe(
      new Date(2026, 4, 25).getTime(),
    );
  });

  it("normalizes any time-of-day to local midnight", () => {
    const input = new Date(2026, 4, 20, 23, 59, 59, 999);
    const got = startOfWeekMonday(input);
    expect(got.getHours()).toBe(0);
    expect(got.getMinutes()).toBe(0);
    expect(got.getSeconds()).toBe(0);
    expect(got.getMilliseconds()).toBe(0);
  });
});

describe("build42Days", () => {
  it("returns exactly 42 entries", () => {
    expect(build42Days(new Date(2026, 4, 18))).toHaveLength(42);
  });

  it("first entry equals the start day, last entry is start + 41 days", () => {
    const start = new Date(2026, 4, 18);
    const days = build42Days(start);
    expect(days[0].getTime()).toBe(start.getTime());
    const expectedLast = new Date(2026, 4, 18 + 41);
    expect(days[41].getTime()).toBe(expectedLast.getTime());
  });

  it("spans month boundaries cleanly (no off-by-one)", () => {
    const days = build42Days(new Date(2026, 4, 25));
    // 2026-05-25 + 41 days = 2026-07-05.
    expect(days[41].getFullYear()).toBe(2026);
    expect(days[41].getMonth()).toBe(6);
    expect(days[41].getDate()).toBe(5);
  });

  it("respects DST-shifted weeks (each day's clock-time is local midnight)", () => {
    // Use a date around a typical DST transition. Even after a clock change,
    // every entry should be local midnight — the calendar grid layer relies
    // on this for its day-key matching.
    const days = build42Days(new Date(2026, 2, 23));
    for (const d of days) {
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    }
  });
});
