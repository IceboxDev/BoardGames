import { describe, expect, it } from "vitest";
import {
  CalendarLocksSchema,
  LockedDateSchema,
  LockInFormSchema,
  LockInRequestBodySchema,
  mkOptimisticLock,
  PicksLockBodySchema,
  SetRsvpBodySchema,
} from "./calendar.ts";

const sampleLocked = {
  lockedBy: "user-1",
  lockedAt: "2026-05-05 12:30:00",
  expectedUserIds: ["user-1", "user-2"],
  rsvps: { "user-1": "yes", "user-2": "no" } as const,
  host: { userId: "user-1", name: "Alice" },
  eventTime: "19:00",
  address: "123 Main St",
  picksLockedAt: null,
  attendance: { definite: 1, tentative: 0 },
};

describe("LockedDateSchema", () => {
  it("accepts a fully-populated lock", () => {
    expect(() => LockedDateSchema.parse(sampleLocked)).not.toThrow();
  });

  it("accepts the lock without host or address", () => {
    const minimal = { ...sampleLocked, host: null, eventTime: null, address: null };
    expect(() => LockedDateSchema.parse(minimal)).not.toThrow();
  });

  it("rejects rsvps with invalid status", () => {
    const bad = { ...sampleLocked, rsvps: { "user-1": "maybe" } };
    expect(() => LockedDateSchema.parse(bad)).toThrow();
  });

  it("rejects negative attendance counts", () => {
    const bad = { ...sampleLocked, attendance: { definite: -1, tentative: 0 } };
    expect(() => LockedDateSchema.parse(bad)).toThrow();
  });

  it("rejects malformed eventTime", () => {
    const bad = { ...sampleLocked, eventTime: "7pm" };
    expect(() => LockedDateSchema.parse(bad)).toThrow();
  });
});

describe("CalendarLocksSchema", () => {
  it("accepts an empty map", () => {
    expect(CalendarLocksSchema.parse({})).toEqual({});
  });

  it("accepts a populated map keyed by date", () => {
    const parsed = CalendarLocksSchema.parse({ "2026-05-05": sampleLocked });
    expect(parsed["2026-05-05"]?.lockedBy).toBe("user-1");
  });
});

describe("LockInFormSchema", () => {
  it("accepts an empty form", () => {
    expect(() => LockInFormSchema.parse({})).not.toThrow();
  });

  it("accepts a fully-populated form (no date)", () => {
    expect(() =>
      LockInFormSchema.parse({
        hostUserId: "user-1",
        hostName: "Alice",
        eventTime: "19:00",
        address: "123 Main St",
      }),
    ).not.toThrow();
  });

  it("rejects malformed eventTime", () => {
    expect(() => LockInFormSchema.parse({ eventTime: "7pm" })).toThrow();
  });
});

describe("LockInRequestBodySchema", () => {
  it("accepts a minimal body (date only)", () => {
    expect(() => LockInRequestBodySchema.parse({ date: "2026-05-05" })).not.toThrow();
  });

  it("rejects malformed date", () => {
    expect(() => LockInRequestBodySchema.parse({ date: "May 5" })).toThrow();
  });
});

describe("PicksLockBodySchema", () => {
  it("requires both date and on", () => {
    expect(() => PicksLockBodySchema.parse({ date: "2026-05-05", on: true })).not.toThrow();
    expect(() => PicksLockBodySchema.parse({ date: "2026-05-05" })).toThrow();
  });

  it("rejects non-boolean on", () => {
    expect(() => PicksLockBodySchema.parse({ date: "2026-05-05", on: "yes" })).toThrow();
  });
});

describe("SetRsvpBodySchema", () => {
  it("accepts yes/no", () => {
    expect(() => SetRsvpBodySchema.parse({ date: "2026-05-05", status: "yes" })).not.toThrow();
    expect(() => SetRsvpBodySchema.parse({ date: "2026-05-05", status: "no" })).not.toThrow();
  });

  it("rejects maybe", () => {
    expect(() => SetRsvpBodySchema.parse({ date: "2026-05-05", status: "maybe" })).toThrow();
  });
});

describe("mkOptimisticLock", () => {
  it("preserves existing fields and only overwrites form-driven ones", () => {
    const form = LockInFormSchema.parse({
      date: "2026-05-05",
      hostUserId: "user-2",
      hostName: "Bob",
      eventTime: "20:00",
    });
    const existing = LockedDateSchema.parse(sampleLocked);
    const lock = mkOptimisticLock(form, existing, "self");
    expect(lock.lockedBy).toBe(sampleLocked.lockedBy);
    expect(lock.expectedUserIds).toEqual(sampleLocked.expectedUserIds);
    expect(lock.rsvps).toEqual(sampleLocked.rsvps);
    expect(lock.attendance).toEqual(sampleLocked.attendance);
    expect(lock.host).toEqual({ userId: "user-2", name: "Bob" });
    expect(lock.eventTime).toBe("20:00");
  });

  it("uses fallbackLockedBy when no existing entry", () => {
    const form = LockInFormSchema.parse({ date: "2026-05-05" });
    const lock = mkOptimisticLock(form, undefined, "self");
    expect(lock.lockedBy).toBe("self");
    expect(lock.expectedUserIds).toEqual([]);
    expect(lock.host).toBeNull();
  });
});
