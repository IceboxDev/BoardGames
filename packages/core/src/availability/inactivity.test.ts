import { describe, expect, it } from "vitest";
import {
  daysAtZeroCoverage,
  daysBetweenDateKeys,
  INACTIVE_AFTER_DAYS,
  isInactiveMember,
} from "./inactivity.ts";

const zero = { can: 0, maybe: 0, total: 41 };
const todayKey = "2026-09-01";

describe("daysAtZeroCoverage", () => {
  it("is 0 whenever any coverage exists — the clock only runs at 0%", () => {
    expect(
      daysAtZeroCoverage({
        coverage: { can: 1, maybe: 0, total: 41 },
        latestMarkedDay: "2026-05-01",
        lastPlayedDay: undefined,
        createdAt: "2026-04-29T10:00:00.000Z",
        todayKey,
      }),
    ).toBe(0);
  });

  it("counts days since the last marked day slid into the past", () => {
    expect(
      daysAtZeroCoverage({
        coverage: zero,
        latestMarkedDay: "2026-08-19",
        lastPlayedDay: undefined,
        createdAt: "2026-04-29T10:00:00.000Z",
        todayKey,
      }),
    ).toBe(13);
  });

  it("a recorded match resets the clock like a marked day", () => {
    expect(
      daysAtZeroCoverage({
        coverage: zero,
        latestMarkedDay: "2026-08-02",
        lastPlayedDay: "2026-08-20",
        createdAt: "2026-04-29T10:00:00.000Z",
        todayKey,
      }),
    ).toBe(12);
  });

  it("falls back to account creation when no signal exists (string or Date)", () => {
    for (const createdAt of ["2026-07-16T08:00:00.000Z", new Date("2026-07-16T08:00:00.000Z")]) {
      expect(
        daysAtZeroCoverage({
          coverage: zero,
          latestMarkedDay: undefined,
          lastPlayedDay: undefined,
          createdAt,
          todayKey,
        }),
      ).toBe(47);
    }
  });

  it("clamps a future-dated signal to 0 instead of going negative", () => {
    expect(
      daysAtZeroCoverage({
        coverage: zero,
        latestMarkedDay: "2026-12-24",
        lastPlayedDay: undefined,
        createdAt: "2026-04-29T10:00:00.000Z",
        todayKey,
      }),
    ).toBe(0);
  });
});

describe("isInactiveMember", () => {
  it("archives a 0% member at the threshold, never an admin or a covered member", () => {
    expect(isInactiveMember("user", zero, INACTIVE_AFTER_DAYS)).toBe(true);
    expect(isInactiveMember("user", zero, INACTIVE_AFTER_DAYS - 1)).toBe(false);
    expect(isInactiveMember("admin", zero, 999)).toBe(false);
    expect(isInactiveMember("user", { can: 1, maybe: 0, total: 41 }, 999)).toBe(false);
    expect(isInactiveMember(null, zero, INACTIVE_AFTER_DAYS)).toBe(true);
  });
});

describe("daysBetweenDateKeys", () => {
  it("computes whole-day differences, negative when reversed", () => {
    expect(daysBetweenDateKeys("2026-08-19", "2026-09-01")).toBe(13);
    expect(daysBetweenDateKeys("2026-09-01", "2026-08-19")).toBe(-13);
  });
});
