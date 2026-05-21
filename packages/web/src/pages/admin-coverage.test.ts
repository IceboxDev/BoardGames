import { describe, expect, it } from "vitest";
import type { AggregateAvailabilityMap, AvailabilityMap } from "../lib/offline-availability";
import { computeCoverage, countMarkedInWindow, formatAuthError } from "./admin-coverage";

// ── countMarkedInWindow ─────────────────────────────────────────────────

describe("countMarkedInWindow", () => {
  const weekStart = new Date(2026, 4, 18); // 2026-05-18 (Mon)
  const today = new Date(2026, 4, 21); // 2026-05-21 (Thu)

  it("returns 0 for null availability", () => {
    expect(countMarkedInWindow(null, today, weekStart)).toBe(0);
  });

  it("counts each can / maybe mark within the today-onward window", () => {
    const availability: AvailabilityMap = {
      "2026-05-21": "can",
      "2026-05-22": "maybe",
      "2026-05-23": "can",
    };
    expect(countMarkedInWindow(availability, today, weekStart)).toBe(3);
  });

  it("skips entries before today even if they're inside the 42-day window", () => {
    const availability: AvailabilityMap = {
      "2026-05-18": "can", // before today (today is 2026-05-21)
      "2026-05-21": "can",
    };
    expect(countMarkedInWindow(availability, today, weekStart)).toBe(1);
  });

  it("ignores entries outside the 42-day window", () => {
    // The window starting 2026-05-18 ends at day 41 → 2026-06-28.
    const availability: AvailabilityMap = {
      "2026-05-21": "can",
      "2026-06-29": "can", // outside the window
    };
    expect(countMarkedInWindow(availability, today, weekStart)).toBe(1);
  });

  it("ignores keys with unexpected values", () => {
    const availability = {
      "2026-05-21": "garbage" as unknown,
      "2026-05-22": "can",
    } as unknown as AvailabilityMap;
    expect(countMarkedInWindow(availability, today, weekStart)).toBe(1);
  });
});

// ── computeCoverage ─────────────────────────────────────────────────────

describe("computeCoverage", () => {
  const dates = ["2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"];

  it("counts a user's can/maybe across the supplied date list", () => {
    const aggregate: AggregateAvailabilityMap = {
      "2026-05-21": [{ userId: "u1", status: "can", name: "U1" }],
      "2026-05-22": [
        { userId: "u1", status: "maybe", name: "U1" },
        { userId: "u2", status: "can", name: "U2" },
      ],
      "2026-05-23": [{ userId: "u2", status: "can", name: "U2" }],
      // 2026-05-24 has no entries → counts as unmarked for u1.
    } as AggregateAvailabilityMap;
    expect(computeCoverage(aggregate, "u1", dates)).toEqual({ can: 1, maybe: 1, total: 4 });
    expect(computeCoverage(aggregate, "u2", dates)).toEqual({ can: 2, maybe: 0, total: 4 });
  });

  it("returns total=0 when no editable dates are provided", () => {
    expect(computeCoverage({}, "u1", [])).toEqual({ can: 0, maybe: 0, total: 0 });
  });

  it("ignores users not present in the aggregate", () => {
    const aggregate: AggregateAvailabilityMap = {
      "2026-05-21": [{ userId: "u2", status: "can", name: "U2" }],
    } as AggregateAvailabilityMap;
    expect(computeCoverage(aggregate, "ghost", dates)).toEqual({ can: 0, maybe: 0, total: 4 });
  });
});

// ── formatAuthError ─────────────────────────────────────────────────────

describe("formatAuthError", () => {
  it("returns the fallback for null / undefined / non-object errors", () => {
    expect(formatAuthError(null, "Something failed")).toBe("Something failed");
    expect(formatAuthError(undefined, "Something failed")).toBe("Something failed");
    expect(formatAuthError("a string", "Something failed")).toBe("Something failed");
  });

  it("prefers .message when it's a non-blank string", () => {
    expect(formatAuthError({ message: "Bad token" }, "fallback")).toBe("Bad token");
  });

  it("falls through .message → .code → .statusText", () => {
    expect(formatAuthError({ code: "auth/invalid" }, "fallback")).toBe("auth/invalid");
    expect(formatAuthError({ statusText: "Unauthorized" }, "fallback")).toBe("Unauthorized");
  });

  it("uses status with the fallback when no string field is set", () => {
    expect(formatAuthError({ status: 500 }, "Save failed")).toBe("Save failed (500)");
  });

  it("treats whitespace-only .message as missing", () => {
    expect(formatAuthError({ message: "   ", code: "x" }, "fallback")).toBe("x");
  });
});
