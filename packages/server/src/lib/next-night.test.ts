import { describe, expect, it } from "vitest";
import { todayDateKey } from "./next-night.ts";

// The group lives in Munich: "today" rolls over at local midnight, not UTC.
// Regression: an Aug 4 game night kept showing as "Next game night" (and was
// excluded from nights-attended) between 00:00 and 02:00 local on Aug 5,
// because the server computed the date key from the UTC clock.

describe("todayDateKey", () => {
  it("rolls to the next day at local midnight, before UTC does (CEST, UTC+2)", () => {
    expect(todayDateKey(new Date("2026-08-04T22:30:00Z"))).toBe("2026-08-05");
  });

  it("rolls at local midnight in winter too (CET, UTC+1)", () => {
    expect(todayDateKey(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
  });

  it("matches the UTC date when both are mid-day", () => {
    expect(todayDateKey(new Date("2026-08-04T12:00:00Z"))).toBe("2026-08-04");
  });

  it("stays on the local day just before local midnight", () => {
    expect(todayDateKey(new Date("2026-08-04T21:59:00Z"))).toBe("2026-08-04");
  });
});
