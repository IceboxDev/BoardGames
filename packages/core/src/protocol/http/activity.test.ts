import { describe, expect, it } from "vitest";
import {
  ActivityEntrySchema,
  ActivityLogQuerySchema,
  ActivityLogResponseSchema,
  AdminDevicesResponseSchema,
  DeviceInfoSchema,
  PageViewBodySchema,
} from "./activity.ts";

const validEntry = {
  id: 42,
  type: "rsvp",
  meta: { date: "2026-08-04", status: "yes" },
  createdAt: "2026-08-04 12:00:00",
};

describe("ActivityEntrySchema", () => {
  it("accepts a well-formed entry", () => {
    expect(() => ActivityEntrySchema.parse(validEntry)).not.toThrow();
  });

  it("accepts unknown event types (open vocabulary)", () => {
    expect(() =>
      ActivityEntrySchema.parse({ ...validEntry, type: "some-future-event" }),
    ).not.toThrow();
  });

  it("rejects a non-positive id", () => {
    const result = ActivityEntrySchema.safeParse({ ...validEntry, id: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["id"]);
    }
  });

  it("rejects an empty type", () => {
    const result = ActivityEntrySchema.safeParse({ ...validEntry, type: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["type"]);
    }
  });

  it("rejects a missing meta", () => {
    const { meta: _meta, ...rest } = validEntry;
    const result = ActivityEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["meta"]);
    }
  });
});

describe("ActivityLogQuerySchema", () => {
  it("coerces string query params and applies the default limit", () => {
    const parsed = ActivityLogQuerySchema.parse({ before: "100" });
    expect(parsed).toEqual({ before: 100, limit: 50 });
  });

  it("rejects a limit over 200", () => {
    const result = ActivityLogQuerySchema.safeParse({ limit: "500" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["limit"]);
    }
  });
});

describe("PageViewBodySchema", () => {
  it("accepts page alone and page+detail", () => {
    expect(() => PageViewBodySchema.parse({ page: "calendar" })).not.toThrow();
    expect(() => PageViewBodySchema.parse({ page: "night", detail: "2026-08-04" })).not.toThrow();
  });

  it("rejects an empty page and an oversized detail", () => {
    expect(PageViewBodySchema.safeParse({ page: "" }).success).toBe(false);
    expect(PageViewBodySchema.safeParse({ page: "night", detail: "x".repeat(101) }).success).toBe(
      false,
    );
  });
});

describe("DeviceInfoSchema", () => {
  const desktop = {
    deviceType: "desktop",
    viewportWidth: 1536,
    viewportHeight: 695,
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 1.25,
    zoomPercent: 125,
    orientation: "landscape",
    browser: "Chrome",
    os: "Windows",
  };

  it("accepts a desktop report and a minimal phone report", () => {
    expect(() => DeviceInfoSchema.parse(desktop)).not.toThrow();
    expect(() =>
      DeviceInfoSchema.parse({
        deviceType: "phone",
        viewportWidth: 411,
        viewportHeight: 731,
        screenWidth: 411,
        screenHeight: 823,
        devicePixelRatio: 2.625,
        pinchScale: 1,
        orientation: "portrait",
      }),
    ).not.toThrow();
  });

  it("rejects an unknown device type and a zero viewport", () => {
    expect(DeviceInfoSchema.safeParse({ ...desktop, deviceType: "watch" }).success).toBe(false);
    expect(DeviceInfoSchema.safeParse({ ...desktop, viewportWidth: 0 }).success).toBe(false);
  });

  it("AdminDevicesResponse wraps entries with seen timestamps and hits", () => {
    expect(() =>
      AdminDevicesResponseSchema.parse({
        devices: [
          {
            id: 1,
            info: desktop,
            firstSeen: "2026-08-01 10:00:00",
            lastSeen: "2026-08-05 09:00:00",
            hits: 12,
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe("ActivityLogResponseSchema", () => {
  it("accepts a page with entries and a next cursor", () => {
    expect(() =>
      ActivityLogResponseSchema.parse({ entries: [validEntry], nextBefore: 42 }),
    ).not.toThrow();
  });

  it("accepts an empty final page", () => {
    expect(() => ActivityLogResponseSchema.parse({ entries: [], nextBefore: null })).not.toThrow();
  });

  it("rejects a missing nextBefore", () => {
    const result = ActivityLogResponseSchema.safeParse({ entries: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["nextBefore"]);
    }
  });
});
