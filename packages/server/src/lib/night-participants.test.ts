import { describe, expect, it } from "vitest";
import { deriveNightParticipants, type NightRsvpRow } from "./night-participants.ts";

const HOST = "u-host";
const yes = (user_id: string, rsvped_at: string): NightRsvpRow => ({
  user_id,
  status: "yes",
  rsvped_at,
});
const no = (user_id: string, rsvped_at = "2026-09-01 10:00:00"): NightRsvpRow => ({
  user_id,
  status: "no",
  rsvped_at,
});

const privateLock = (over: Partial<Parameters<typeof deriveNightParticipants>[0]> = {}) => ({
  isPrivate: true,
  seatCount: 4,
  pickMode: "host" as const,
  hostUserId: HOST,
  expectedUserIds: [HOST, "a", "b", "c", "d", "e"],
  ...over,
});

describe("deriveNightParticipants — open night", () => {
  it("keeps the historical rule: (can ∪ yes) − no, maybes tentative, window [n, n+m]", () => {
    const p = deriveNightParticipants(
      {
        isPrivate: false,
        seatCount: null,
        pickMode: "group",
        hostUserId: HOST,
        expectedUserIds: [],
      },
      [yes("y1", "2026-09-01 10:00:00"), no("c2")],
      [
        { user_id: "c1", status: "can" },
        { user_id: "c2", status: "can" },
        { user_id: "m1", status: "maybe" },
        { user_id: "y1", status: "maybe" },
      ],
    );
    expect(p.definite.sort()).toEqual(["c1", "y1"]);
    expect(p.tentative).toEqual(["m1"]);
    expect(p.window).toEqual({ lo: 2, hi: 3 });
    expect(p.seats).toBeNull();
    expect(p.canView("anyone", false)).toBe(true);
    expect(p.canReact("anyone", false)).toBe(true);
    expect(p.seatOf("c1")).toBeNull();
  });
});

describe("deriveNightParticipants — private night", () => {
  it("seats the host first, then yes answers in arrival order, overflow to the waitlist", () => {
    const p = deriveNightParticipants(
      privateLock(),
      [
        yes("c", "2026-09-01 10:00:02"),
        yes("a", "2026-09-01 10:00:00"),
        yes("b", "2026-09-01 10:00:01"),
        yes("d", "2026-09-01 10:00:03"),
        no("e"),
      ],
      [],
    );
    expect(p.seated).toEqual([HOST, "a", "b", "c"]);
    expect(p.waitlisted).toEqual(["d"]);
    expect(p.declined).toEqual(["e"]);
    expect(p.invitedNoAnswer).toEqual([]);
    expect(p.seats).toEqual({ total: 4, taken: 4, waitlisted: 1 });
    expect(p.definite).toEqual(p.seated);
    expect(p.tentative).toEqual([]);
    expect(p.seatOf(HOST)).toBe("host");
    expect(p.seatOf("d")).toBe("waitlisted");
    expect(p.seatOf("e")).toBe("declined");
  });

  it("ignores availability marks and stale rows from people not on the list", () => {
    const p = deriveNightParticipants(
      privateLock({ expectedUserIds: [HOST, "a"] }),
      [yes("outsider", "2026-09-01 09:00:00"), yes("a", "2026-09-01 10:00:00")],
      [
        { user_id: "outsider", status: "can" },
        { user_id: "keen", status: "can" },
      ],
    );
    expect(p.seated).toEqual([HOST, "a"]);
    expect(p.seatOf("outsider")).toBeNull();
    expect(p.canView("outsider", false)).toBe(false);
    expect(p.canView("outsider", true)).toBe(true);
    expect(p.canRsvp("outsider")).toBe(false);
  });

  it("breaks same-second ties by user id and honours millisecond stamps", () => {
    const p = deriveNightParticipants(
      privateLock({ seatCount: 2 }),
      [
        yes("b", "2026-09-01 10:00:00"),
        yes("a", "2026-09-01 10:00:00"),
        yes("c", "2026-09-01 09:59:59.900"),
      ],
      [],
    );
    expect(p.seated).toEqual([HOST, "c"]);
    expect(p.waitlisted).toEqual(["a", "b"]);
  });

  it("lists the host as seated even without an rsvp row, and never on the waitlist", () => {
    const p = deriveNightParticipants(
      privateLock({ seatCount: 2 }),
      [yes("a", "2026-09-01 10:00:00"), yes("b", "2026-09-01 10:00:01")],
      [],
    );
    expect(p.seated).toEqual([HOST, "a"]);
    expect(p.waitlisted).toEqual(["b"]);
    expect(p.invitedNoAnswer.sort()).toEqual(["c", "d", "e"]);
  });

  it("promotes the next in line when a seated player drops", () => {
    const rows = [
      yes("a", "2026-09-01 10:00:00"),
      yes("b", "2026-09-01 10:00:01"),
      yes("c", "2026-09-01 10:00:02"),
      yes("d", "2026-09-01 10:00:03"),
    ];
    const before = deriveNightParticipants(privateLock(), rows, []);
    expect(before.waitlisted).toEqual(["d"]);
    const after = deriveNightParticipants(
      privateLock(),
      rows.map((r) => (r.user_id === "b" ? no("b", "2026-09-01 11:00:00") : r)),
      [],
    );
    expect(after.seated).toEqual([HOST, "a", "c", "d"]);
    expect(after.waitlisted).toEqual([]);
  });

  it("bumps the last arrivals when the seat count is lowered below the taken count", () => {
    const rows = [yes("a", "2026-09-01 10:00:00"), yes("b", "2026-09-01 10:00:01")];
    const p = deriveNightParticipants(privateLock({ seatCount: 2 }), rows, []);
    expect(p.seated).toEqual([HOST, "a"]);
    expect(p.waitlisted).toEqual(["b"]);
  });

  it("uses the seat count as the player window", () => {
    const p = deriveNightParticipants(privateLock({ seatCount: 5 }), [], []);
    expect(p.window).toEqual({ lo: 5, hi: 5 });
  });

  it("host mode: only the host votes; group mode: the seated players vote", () => {
    const rows = [yes("a", "2026-09-01 10:00:00"), yes("b", "2026-09-01 10:00:01")];
    const hostMode = deriveNightParticipants(privateLock({ seatCount: 2 }), rows, []);
    expect([...hostMode.voters]).toEqual([HOST]);
    expect(hostMode.canReact("a", false)).toBe(false);
    expect(hostMode.canReact("a", true)).toBe(true);
    const groupMode = deriveNightParticipants(
      privateLock({ seatCount: 2, pickMode: "group" }),
      rows,
      [],
    );
    expect([...groupMode.voters].sort()).toEqual(["a", HOST]);
    expect(groupMode.canReact("b", false)).toBe(false); // waitlisted
    expect(groupMode.canReact("a", false)).toBe(true);
  });
});
