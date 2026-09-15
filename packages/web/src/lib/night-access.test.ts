import { LockedDateSchema } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { canManageNight, seatsLeft, viewerSeat, waitlistPosition } from "./night-access";

const base = LockedDateSchema.parse({
  lockedBy: "admin",
  lockedAt: "2026-09-01 12:00:00",
  expectedUserIds: ["host", "a", "b", "c", "d"],
  rsvps: { host: "yes", a: "yes", b: "yes", c: "no" },
  host: { userId: "host", name: "Host" },
  eventTime: null,
  address: null,
  picksLockedAt: null,
  attendance: { definite: 2, tentative: 0 },
  isPrivate: true,
  seats: { total: 2, taken: 2, waitlisted: 1 },
  seatedUserIds: ["host", "a"],
  waitlistUserIds: ["b"],
});

describe("viewerSeat", () => {
  it("names every place on the guest list", () => {
    expect(viewerSeat(base, "host", false)).toBe("host");
    expect(viewerSeat(base, "a", false)).toBe("seated");
    expect(viewerSeat(base, "b", false)).toBe("waitlisted");
    expect(viewerSeat(base, "c", false)).toBe("declined");
    expect(viewerSeat(base, "d", false)).toBe("invited");
  });

  it("is outsider on a redacted lock, and for an uninvited admin", () => {
    const redacted = { ...base, redacted: true, expectedUserIds: [], seatedUserIds: [], rsvps: {} };
    expect(viewerSeat(redacted, "x", false)).toBe("outsider");
    expect(viewerSeat(base, "admin", true)).toBe("outsider");
  });

  it("is null on open nights and when signed out", () => {
    expect(viewerSeat({ ...base, isPrivate: false }, "a", false)).toBeNull();
    expect(viewerSeat(base, null, false)).toBeNull();
    expect(viewerSeat(undefined, "a", false)).toBeNull();
  });
});

describe("waitlistPosition / seatsLeft / canManageNight", () => {
  it("counts from one and knows when the table is full", () => {
    expect(waitlistPosition(base, "b")).toBe(1);
    expect(waitlistPosition(base, "a")).toBeNull();
    expect(seatsLeft(base)).toBe(0);
    expect(seatsLeft({ ...base, seats: { total: 5, taken: 2, waitlisted: 0 } })).toBe(3);
    expect(seatsLeft({ ...base, seats: null })).toBeNull();
  });

  it("lets the host and the admin manage, nobody else", () => {
    expect(canManageNight(base, "host", false)).toBe(true);
    expect(canManageNight(base, "a", true)).toBe(true);
    expect(canManageNight(base, "a", false)).toBe(false);
    expect(canManageNight(base, null, true)).toBe(false);
  });
});
