import { describe, expect, it } from "vitest";
import {
  AdminNightGuestBodySchema,
  AvailableGamesSchema,
  CalendarLocksSchema,
  HostStatsMapSchema,
  KickRsvpBodySchema,
  LockedDateSchema,
  LockInFormSchema,
  LockInRequestBodySchema,
  mkOptimisticLock,
  PicksLockBodySchema,
  PrivateNightUpdateBodySchema,
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
  hostAtHome: true,
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

  it("defaults hostAtHome to true when missing (legacy payload)", () => {
    const { hostAtHome: _omit, ...withoutFlag } = sampleLocked;
    void _omit;
    const parsed = LockedDateSchema.parse(withoutFlag);
    expect(parsed.hostAtHome).toBe(true);
  });

  it("preserves hostAtHome=false on the wire", () => {
    const parsed = LockedDateSchema.parse({ ...sampleLocked, hostAtHome: false });
    expect(parsed.hostAtHome).toBe(false);
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

  it("defaults topGameSlug to null when missing (legacy payload)", () => {
    const parsed = LockedDateSchema.parse(sampleLocked);
    expect(parsed.topGameSlug).toBeNull();
  });

  it("preserves a topGameSlug on the wire", () => {
    const parsed = LockedDateSchema.parse({
      ...sampleLocked,
      topGameSlug: "dungeons-and-dragons",
    });
    expect(parsed.topGameSlug).toBe("dungeons-and-dragons");
  });

  it("defaults every private-night field for a pre-feature payload", () => {
    const parsed = LockedDateSchema.parse(sampleLocked);
    expect(parsed.isPrivate).toBe(false);
    expect(parsed.title).toBeNull();
    expect(parsed.pickMode).toBe("group");
    expect(parsed.seats).toBeNull();
    expect(parsed.seatedUserIds).toEqual([]);
    expect(parsed.waitlistUserIds).toEqual([]);
    expect(parsed.redacted).toBe(false);
  });

  it("accepts a private night with seats and seat lists", () => {
    const parsed = LockedDateSchema.parse({
      ...sampleLocked,
      isPrivate: true,
      title: "TI4 marathon",
      pickMode: "host",
      seats: { total: 5, taken: 3, waitlisted: 1 },
      seatedUserIds: ["user-1", "user-2", "user-3"],
      waitlistUserIds: ["user-4"],
    });
    expect(parsed.seats?.total).toBe(5);
    expect(parsed.pickMode).toBe("host");
  });

  it("accepts the redacted outsider shape", () => {
    const parsed = LockedDateSchema.parse({
      ...sampleLocked,
      expectedUserIds: [],
      rsvps: {},
      eventTime: null,
      address: null,
      isPrivate: true,
      seats: { total: 5, taken: 3, waitlisted: 0 },
      redacted: true,
    });
    expect(parsed.redacted).toBe(true);
    expect(parsed.host?.name).toBe("Alice");
  });

  it("rejects a zero-seat night and an unknown pick mode", () => {
    expect(() =>
      LockedDateSchema.parse({ ...sampleLocked, seats: { total: 0, taken: 0, waitlisted: 0 } }),
    ).toThrow();
    expect(() => LockedDateSchema.parse({ ...sampleLocked, pickMode: "vote" })).toThrow();
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

describe("HostStatsMapSchema", () => {
  it("accepts per-user host stats keyed by userId", () => {
    const parsed = HostStatsMapSchema.parse({
      "user-1": { totalHosts: 5, lastHostedDate: "2026-06-02" },
      "user-2": { totalHosts: 0, lastHostedDate: null },
    });
    expect(parsed["user-1"]?.totalHosts).toBe(5);
    expect(parsed["user-2"]?.lastHostedDate).toBeNull();
  });

  it("rejects a negative host count", () => {
    expect(() =>
      HostStatsMapSchema.parse({ "user-1": { totalHosts: -1, lastHostedDate: null } }),
    ).toThrow();
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

  it("accepts a private night with host, seats and invitees", () => {
    expect(() =>
      LockInRequestBodySchema.parse({
        date: "2026-05-05",
        hostUserId: "user-1",
        hostName: "Alice",
        isPrivate: true,
        seatCount: 5,
        inviteeIds: ["user-2", "user-3"],
        pickMode: "host",
        title: "TI4 marathon",
      }),
    ).not.toThrow();
  });

  it("requires a host and a seat count once isPrivate is set — on the body AND the form", () => {
    const noHost = { date: "2026-05-05", isPrivate: true, seatCount: 5 };
    expect(LockInRequestBodySchema.safeParse(noHost).success).toBe(false);
    expect(LockInFormSchema.safeParse({ isPrivate: true, seatCount: 5 }).success).toBe(false);
    const noSeats = { date: "2026-05-05", isPrivate: true, hostUserId: "user-1" };
    expect(LockInRequestBodySchema.safeParse(noSeats).success).toBe(false);
    expect(LockInFormSchema.safeParse({ isPrivate: true, hostUserId: "user-1" }).success).toBe(
      false,
    );
  });

  it("bounds the seat count and the title length", () => {
    const base = { date: "2026-05-05", hostUserId: "user-1", isPrivate: true };
    expect(LockInRequestBodySchema.safeParse({ ...base, seatCount: 1 }).success).toBe(false);
    expect(LockInRequestBodySchema.safeParse({ ...base, seatCount: 21 }).success).toBe(false);
    expect(
      LockInRequestBodySchema.safeParse({ ...base, seatCount: 4, title: "x".repeat(81) }).success,
    ).toBe(false);
  });
});

describe("PrivateNightUpdateBodySchema", () => {
  it("accepts a partial update", () => {
    expect(() =>
      PrivateNightUpdateBodySchema.parse({
        date: "2026-05-05",
        seatCount: 6,
        addInviteeIds: ["user-9"],
      }),
    ).not.toThrow();
    expect(() =>
      PrivateNightUpdateBodySchema.parse({ date: "2026-05-05", pickMode: "group", title: null }),
    ).not.toThrow();
  });

  it("rejects an empty invitee id, an out-of-range seat count and a bad date", () => {
    expect(
      PrivateNightUpdateBodySchema.safeParse({ date: "2026-05-05", removeInviteeIds: [""] })
        .success,
    ).toBe(false);
    expect(
      PrivateNightUpdateBodySchema.safeParse({ date: "2026-05-05", seatCount: 1 }).success,
    ).toBe(false);
    expect(PrivateNightUpdateBodySchema.safeParse({ date: "May 5" }).success).toBe(false);
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

describe("KickRsvpBodySchema", () => {
  it("accepts a valid kick body", () => {
    expect(() => KickRsvpBodySchema.parse({ date: "2026-05-05", userId: "user-2" })).not.toThrow();
  });

  it("rejects missing userId", () => {
    expect(() => KickRsvpBodySchema.parse({ date: "2026-05-05" })).toThrow();
  });

  it("rejects empty userId", () => {
    expect(() => KickRsvpBodySchema.parse({ date: "2026-05-05", userId: "" })).toThrow();
  });

  it("rejects malformed date", () => {
    expect(() => KickRsvpBodySchema.parse({ date: "May 5", userId: "user-2" })).toThrow();
  });
});

describe("AdminNightGuestBodySchema", () => {
  it("accepts add and remove bodies", () => {
    expect(() =>
      AdminNightGuestBodySchema.parse({ date: "2026-05-05", guestUserId: "g1", on: true }),
    ).not.toThrow();
    expect(() =>
      AdminNightGuestBodySchema.parse({ date: "2026-05-05", guestUserId: "g1", on: false }),
    ).not.toThrow();
  });

  it("rejects a missing on flag", () => {
    expect(() =>
      AdminNightGuestBodySchema.parse({ date: "2026-05-05", guestUserId: "g1" }),
    ).toThrow();
  });

  it("rejects empty guestUserId and malformed date", () => {
    expect(() =>
      AdminNightGuestBodySchema.parse({ date: "2026-05-05", guestUserId: "", on: true }),
    ).toThrow();
    expect(() =>
      AdminNightGuestBodySchema.parse({ date: "May 5", guestUserId: "g1", on: true }),
    ).toThrow();
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

  it("carries the existing topGameSlug across a re-lock", () => {
    const existing = LockedDateSchema.parse({
      ...sampleLocked,
      topGameSlug: "dungeons-and-dragons",
    });
    const form = LockInFormSchema.parse({ eventTime: "20:00" });
    const lock = mkOptimisticLock(form, existing, "self");
    expect(lock.topGameSlug).toBe("dungeons-and-dragons");
  });

  it("uses fallbackLockedBy when no existing entry", () => {
    const form = LockInFormSchema.parse({ date: "2026-05-05" });
    const lock = mkOptimisticLock(form, undefined, "self");
    expect(lock.lockedBy).toBe("self");
    expect(lock.expectedUserIds).toEqual([]);
    expect(lock.host).toBeNull();
  });

  it("defaults hostAtHome to true when neither form nor existing supplies it", () => {
    const form = LockInFormSchema.parse({});
    const lock = mkOptimisticLock(form, undefined, "self");
    expect(lock.hostAtHome).toBe(true);
  });

  it("honors an explicit hostAtHome=false from the form", () => {
    const form = LockInFormSchema.parse({ hostAtHome: false });
    const lock = mkOptimisticLock(form, undefined, "self");
    expect(lock.hostAtHome).toBe(false);
  });

  it("inherits hostAtHome from the existing row when the form is silent", () => {
    const existing = LockedDateSchema.parse({ ...sampleLocked, hostAtHome: false });
    const form = LockInFormSchema.parse({ eventTime: "20:00" });
    const lock = mkOptimisticLock(form, existing, "self");
    expect(lock.hostAtHome).toBe(false);
  });

  it("paints a fresh private night: host seated, invitees expected, seats from the form", () => {
    const form = LockInFormSchema.parse({
      hostUserId: "user-1",
      hostName: "Alice",
      isPrivate: true,
      seatCount: 5,
      inviteeIds: ["user-2", "user-3"],
      pickMode: "host",
      title: "TI4 marathon",
    });
    const lock = mkOptimisticLock(form, undefined, "admin");
    expect(lock.isPrivate).toBe(true);
    expect(lock.expectedUserIds).toEqual(["user-1", "user-2", "user-3"]);
    expect(lock.seatedUserIds).toEqual(["user-1"]);
    expect(lock.seats).toEqual({ total: 5, taken: 1, waitlisted: 0 });
    expect(lock.pickMode).toBe("host");
    expect(lock.title).toBe("TI4 marathon");
    expect(lock.redacted).toBe(false);
  });

  it("keeps the existing guest list on a private edit that omits inviteeIds", () => {
    const existing = LockedDateSchema.parse({
      ...sampleLocked,
      isPrivate: true,
      seats: { total: 5, taken: 2, waitlisted: 0 },
      seatedUserIds: ["user-1", "user-2"],
    });
    const form = LockInFormSchema.parse({
      hostUserId: "user-1",
      hostName: "Alice",
      isPrivate: true,
      seatCount: 6,
    });
    const lock = mkOptimisticLock(form, existing, "admin");
    expect(lock.expectedUserIds).toEqual(sampleLocked.expectedUserIds);
    expect(lock.seats).toEqual({ total: 6, taken: 2, waitlisted: 0 });
  });

  it("clears the seat tally when a night is switched back to open", () => {
    const existing = LockedDateSchema.parse({
      ...sampleLocked,
      isPrivate: true,
      seats: { total: 5, taken: 2, waitlisted: 0 },
      seatedUserIds: ["user-1", "user-2"],
    });
    const form = LockInFormSchema.parse({
      hostUserId: "user-1",
      hostName: "Alice",
      isPrivate: false,
    });
    const lock = mkOptimisticLock(form, existing, "admin");
    expect(lock.isPrivate).toBe(false);
    expect(lock.seats).toBeNull();
    expect(lock.seatedUserIds).toEqual([]);
  });
});

describe("AvailableGamesSchema", () => {
  const base = {
    ownedSlugs: ["catan"],
    definiteCount: 3,
    tentativeCount: 0,
    participantIds: ["u1"],
    reactions: {},
    topSlugs: [],
    attendees: [],
  };

  it("defaults newSlugs to none for a payload persisted before the field", () => {
    expect(AvailableGamesSchema.parse(base).newSlugs).toEqual([]);
  });

  it("carries the attending owners' new copies", () => {
    expect(AvailableGamesSchema.parse({ ...base, newSlugs: ["catan"] }).newSlugs).toEqual([
      "catan",
    ]);
  });
});
