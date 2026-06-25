import { describe, expect, it } from "vitest";
import { formatDayKey, formatMonthYear, formatShortDate, parseDateKey } from "./date-format";

describe("parseDateKey", () => {
  it("parses a valid key as local midnight", () => {
    const d = parseDateKey("2026-07-11");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6); // July is month index 6
    expect(d?.getDate()).toBe(11);
  });

  it("returns null for a malformed key", () => {
    expect(parseDateKey("garbage")).toBeNull();
    expect(parseDateKey("2026-00-11")).toBeNull(); // month 0 is invalid
    expect(parseDateKey("")).toBeNull();
  });
});

describe("formatDayKey", () => {
  it("falls back to the raw key when unparseable", () => {
    expect(formatDayKey("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid key (default style omits the year)", () => {
    const out = formatDayKey("2026-07-11");
    expect(out).not.toBe("2026-07-11");
    expect(out).not.toContain("2026");
  });

  it("includes the year for year-bearing styles only", () => {
    // Numeric year is locale-stable; weekday/month names are not, so assert on it.
    expect(formatDayKey("2026-07-11", "full")).toContain("2026");
    expect(formatDayKey("2026-07-11", "compact")).toContain("2026");
    expect(formatDayKey("2026-07-11", "short")).not.toContain("2026");
    expect(formatDayKey("2026-07-11", "weekday")).not.toContain("2026");
  });
});

describe("timestamp formatters", () => {
  it("falls back verbatim on an unparseable value", () => {
    expect(formatMonthYear("nope")).toBe("nope");
    expect(formatShortDate("nope")).toBe("nope");
  });

  it("formats a parseable ISO timestamp", () => {
    expect(formatMonthYear("2026-07-11T12:00:00Z")).toContain("2026");
    expect(formatShortDate("2026-07-11T12:00:00Z")).toContain("2026");
  });
});
