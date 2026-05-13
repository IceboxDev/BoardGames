import { describe, expect, it } from "vitest";
import {
  CalendarFeedStatusSchema,
  CalendarFeedTokenResponseSchema,
  CalendarFeedTokenSchema,
} from "./calendar-feed.ts";

const validToken = `cs_${"a".repeat(43)}`;

describe("CalendarFeedTokenSchema", () => {
  it("accepts cs_-prefixed url-safe base64 of 43 chars", () => {
    expect(() => CalendarFeedTokenSchema.parse(validToken)).not.toThrow();
  });

  it("accepts url-safe alphabet characters", () => {
    const mixed = `cs_${"A".repeat(10)}${"z".repeat(10)}${"0".repeat(10)}${"-_-_-_-_-_-_-"}`;
    expect(() => CalendarFeedTokenSchema.parse(mixed)).not.toThrow();
  });

  it("rejects missing prefix", () => {
    expect(() => CalendarFeedTokenSchema.parse("a".repeat(46))).toThrow();
  });

  it("rejects wrong prefix", () => {
    expect(() => CalendarFeedTokenSchema.parse(`bg_${"a".repeat(43)}`)).toThrow();
  });

  it("rejects wrong length (too short)", () => {
    expect(() => CalendarFeedTokenSchema.parse(`cs_${"a".repeat(42)}`)).toThrow();
  });

  it("rejects wrong length (too long)", () => {
    expect(() => CalendarFeedTokenSchema.parse(`cs_${"a".repeat(44)}`)).toThrow();
  });

  it("rejects base64-with-padding (must be url-safe, no '=')", () => {
    expect(() => CalendarFeedTokenSchema.parse(`cs_${"a".repeat(42)}=`)).toThrow();
  });

  it("rejects non-base64url characters", () => {
    expect(() => CalendarFeedTokenSchema.parse(`cs_${"a".repeat(42)}+`)).toThrow();
    expect(() => CalendarFeedTokenSchema.parse(`cs_${"a".repeat(42)}/`)).toThrow();
  });
});

describe("CalendarFeedTokenResponseSchema", () => {
  it("accepts a fully-populated response", () => {
    const ok = {
      token: validToken,
      subscribeUrl: "https://api.example.com/api/ical/feed/cs_xxx/calendar.ics",
      webcalUrl: "webcal://api.example.com/api/ical/feed/cs_xxx/calendar.ics",
      createdAt: "2026-05-12 10:30:00",
    };
    expect(() => CalendarFeedTokenResponseSchema.parse(ok)).not.toThrow();
  });

  it("rejects subscribeUrl that isn't a URL", () => {
    const bad = {
      token: validToken,
      subscribeUrl: "not-a-url",
      webcalUrl: "webcal://api.example.com/foo",
      createdAt: "2026-05-12 10:30:00",
    };
    expect(() => CalendarFeedTokenResponseSchema.parse(bad)).toThrow();
  });

  it("rejects webcalUrl without the webcal:// scheme", () => {
    const bad = {
      token: validToken,
      subscribeUrl: "https://api.example.com/foo",
      webcalUrl: "https://api.example.com/foo",
      createdAt: "2026-05-12 10:30:00",
    };
    expect(() => CalendarFeedTokenResponseSchema.parse(bad)).toThrow();
  });
});

describe("CalendarFeedStatusSchema", () => {
  it("accepts the never-connected shape", () => {
    expect(() =>
      CalendarFeedStatusSchema.parse({
        connected: false,
        createdAt: null,
        lastAccessedAt: null,
      }),
    ).not.toThrow();
  });

  it("accepts the connected-but-never-fetched shape", () => {
    expect(() =>
      CalendarFeedStatusSchema.parse({
        connected: true,
        createdAt: "2026-05-12 10:30:00",
        lastAccessedAt: null,
      }),
    ).not.toThrow();
  });

  it("accepts the fully-active shape", () => {
    expect(() =>
      CalendarFeedStatusSchema.parse({
        connected: true,
        createdAt: "2026-05-12 10:30:00",
        lastAccessedAt: "2026-05-13 14:22:08",
      }),
    ).not.toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => CalendarFeedStatusSchema.parse({ connected: true })).toThrow();
  });
});
