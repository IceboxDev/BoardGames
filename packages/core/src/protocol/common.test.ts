import { describe, expect, it } from "vitest";
import {
  DateKeySchema,
  ErrorResponseSchema,
  GameSlugSchema,
  IsoTimestampSchema,
  NightKeySchema,
  NightKeyStringSchema,
  nightDate,
  nightKeyFor,
  nightKeysOf,
  nightSlot,
  TimeOfDaySchema,
} from "./common.ts";

describe("DateKeySchema", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(DateKeySchema.parse("2026-05-05")).toBe("2026-05-05");
  });

  it("rejects malformed strings", () => {
    expect(() => DateKeySchema.parse("2026-5-5")).toThrow();
    expect(() => DateKeySchema.parse("not-a-date")).toThrow();
    expect(() => DateKeySchema.parse("")).toThrow();
  });
});

describe("NightKeySchema", () => {
  it("accepts a plain date and a second-night key", () => {
    expect(NightKeySchema.parse("2026-05-05")).toBe("2026-05-05");
    expect(NightKeySchema.parse("2026-05-05_2")).toBe("2026-05-05_2");
    expect(NightKeyStringSchema.parse("2026-05-05_2")).toBe("2026-05-05_2");
  });

  it("rejects anything but the two slots", () => {
    expect(() => NightKeySchema.parse("2026-05-05_1")).toThrow();
    expect(() => NightKeySchema.parse("2026-05-05_3")).toThrow();
    expect(() => NightKeySchema.parse("2026-05-05_")).toThrow();
    expect(() => NightKeySchema.parse("2026-5-5_2")).toThrow();
    expect(() => DateKeySchema.parse("2026-05-05_2")).toThrow();
  });

  it("splits a key into its date and slot", () => {
    expect(nightDate("2026-05-05_2")).toBe("2026-05-05");
    expect(nightDate("2026-05-05")).toBe("2026-05-05");
    expect(nightSlot("2026-05-05_2")).toBe(2);
    expect(nightSlot("2026-05-05")).toBe(1);
    expect(nightKeyFor("2026-05-05", 2)).toBe("2026-05-05_2");
    expect(nightKeyFor("2026-05-05", 1)).toBe("2026-05-05");
    expect(nightKeysOf("2026-05-05")).toEqual(["2026-05-05", "2026-05-05_2"]);
  });

  it("sorts a second night after its date and before the next one", () => {
    const keys = ["2026-05-06", "2026-05-05_2", "2026-05-05"].sort();
    expect(keys).toEqual(["2026-05-05", "2026-05-05_2", "2026-05-06"]);
  });
});

describe("IsoTimestampSchema", () => {
  it("accepts ISO-8601 with Z", () => {
    expect(() => IsoTimestampSchema.parse("2026-05-05T12:30:00.000Z")).not.toThrow();
    expect(() => IsoTimestampSchema.parse("2026-05-05T12:30:00Z")).not.toThrow();
  });

  it("accepts ISO-8601 with offset", () => {
    expect(() => IsoTimestampSchema.parse("2026-05-05T12:30:00+02:00")).not.toThrow();
  });

  it("rejects bare date or time", () => {
    expect(() => IsoTimestampSchema.parse("2026-05-05")).toThrow();
    expect(() => IsoTimestampSchema.parse("12:30:00")).toThrow();
  });
});

describe("TimeOfDaySchema", () => {
  it("accepts HH:MM", () => {
    expect(TimeOfDaySchema.parse("00:00")).toBe("00:00");
    expect(TimeOfDaySchema.parse("23:59")).toBe("23:59");
  });

  it("rejects out-of-range values", () => {
    expect(() => TimeOfDaySchema.parse("24:00")).toThrow();
    expect(() => TimeOfDaySchema.parse("12:60")).toThrow();
    expect(() => TimeOfDaySchema.parse("9:00")).toThrow();
  });
});

describe("GameSlugSchema", () => {
  it("accepts kebab-case slugs", () => {
    expect(GameSlugSchema.parse("lost-cities")).toBe("lost-cities");
    expect(GameSlugSchema.parse("set")).toBe("set");
    expect(GameSlugSchema.parse("7-wonders")).toBe("7-wonders");
  });

  it("rejects uppercase, spaces, and over-long slugs", () => {
    expect(() => GameSlugSchema.parse("Lost-Cities")).toThrow();
    expect(() => GameSlugSchema.parse("lost cities")).toThrow();
    expect(() => GameSlugSchema.parse("a".repeat(65))).toThrow();
  });
});

describe("ErrorResponseSchema", () => {
  it("accepts a bare error envelope", () => {
    expect(ErrorResponseSchema.parse({ error: "something went wrong" })).toEqual({
      error: "something went wrong",
    });
  });

  it("accepts an envelope with an optional code", () => {
    expect(ErrorResponseSchema.parse({ error: "nope", code: "FORBIDDEN" })).toEqual({
      error: "nope",
      code: "FORBIDDEN",
    });
  });

  it("rejects an envelope missing the error field", () => {
    const result = ErrorResponseSchema.safeParse({ code: "FORBIDDEN" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["error"]);
    }
  });
});
