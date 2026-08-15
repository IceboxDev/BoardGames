import type { ProfileNightItem } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import {
  attendanceStreaks,
  hostGroups,
  monthlyAttendance,
  nightTotals,
  rsvpBehavior,
  weekdayBreakdown,
} from "./night-stats.ts";

function night(overrides: Partial<ProfileNightItem>): ProfileNightItem {
  return {
    dateKey: "2026-07-10",
    host: { userId: "h1", name: "Mantas" },
    address: "Musterstraße 1, Munich",
    eventTime: "19:00",
    attended: true,
    attendedVia: "played",
    rsvp: "yes",
    rsvpAuto: false,
    matchesPlayedByUser: 3,
    totalMatches: 4,
    ...overrides,
  };
}

describe("nightTotals", () => {
  it("counts attendance, hosting, and games per attended night", () => {
    const totals = nightTotals(
      [
        night({ dateKey: "2026-07-10", host: { userId: "me", name: "Me" } }),
        night({
          dateKey: "2026-06-10",
          attended: false,
          attendedVia: null,
          matchesPlayedByUser: 0,
        }),
        night({ dateKey: "2026-05-10", matchesPlayedByUser: 1 }),
      ],
      "me",
    );
    expect(totals).toMatchObject({
      total: 3,
      attended: 2,
      hosted: 1,
      lastHostedDateKey: "2026-07-10",
      gamesPlayed: 4,
      avgGamesPerAttendedNight: 2,
    });
  });
});

describe("attendanceStreaks", () => {
  it("tracks current (from the newest night) and longest runs", () => {
    // Newest first: attended, attended, missed, attended.
    const streaks = attendanceStreaks([
      night({ dateKey: "2026-07-04" }),
      night({ dateKey: "2026-07-03" }),
      night({ dateKey: "2026-07-02", attended: false, attendedVia: null }),
      night({ dateKey: "2026-07-01" }),
    ]);
    expect(streaks).toEqual({ current: 2, longest: 2 });
  });

  it("reports current 0 when the last night was missed", () => {
    const streaks = attendanceStreaks([
      night({ dateKey: "2026-07-02", attended: false, attendedVia: null }),
      night({ dateKey: "2026-07-01" }),
    ]);
    expect(streaks).toEqual({ current: 0, longest: 1 });
  });
});

describe("monthlyAttendance", () => {
  it("buckets by month and fills gaps", () => {
    const buckets = monthlyAttendance([
      night({ dateKey: "2026-05-10" }),
      night({ dateKey: "2026-03-10", attended: false, attendedVia: null }),
    ]);
    expect(buckets.map((b) => b.key)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(buckets[0]).toMatchObject({ attended: 0, missed: 1 });
    expect(buckets[2]).toMatchObject({ attended: 1, missed: 0 });
  });
});

describe("weekdayBreakdown", () => {
  it("maps date keys onto Mon–Sun buckets", () => {
    // 2026-07-10 is a Friday; 2026-07-12 a Sunday.
    const buckets = weekdayBreakdown([
      night({ dateKey: "2026-07-10" }),
      night({ dateKey: "2026-07-12", attended: false, attendedVia: null }),
    ]);
    expect(buckets[4]).toMatchObject({ label: "Fri", attended: 1 });
    expect(buckets[6]).toMatchObject({ label: "Sun", missed: 1 });
  });
});

describe("hostGroups", () => {
  it("groups by host and picks the MOST FREQUENT address, not the latest", () => {
    // Newest first: hosted once at a new place, twice at the usual one.
    const groups = hostGroups([
      night({ host: { userId: "h1", name: "Mantas" }, address: "New Street 2" }),
      night({
        dateKey: "2026-06-10",
        host: { userId: "h1", name: "Mantas" },
        address: "Usual Street 1",
        attended: false,
        attendedVia: null,
      }),
      night({
        dateKey: "2026-05-20",
        host: { userId: "h1", name: "Mantas" },
        address: "Usual Street 1",
      }),
      night({ dateKey: "2026-05-10", host: null, address: null }),
    ]);
    expect(groups[0]).toMatchObject({
      name: "Mantas",
      usualAddress: "Usual Street 1",
      attended: 2,
      total: 3,
    });
    expect(groups[1]).toMatchObject({ name: "No host recorded", total: 1 });
  });

  it("breaks address-frequency ties toward the most recent", () => {
    const groups = hostGroups([
      night({ host: { userId: "h1", name: "Mantas" }, address: "Newer Place" }),
      night({
        dateKey: "2026-06-10",
        host: { userId: "h1", name: "Mantas" },
        address: "Older Place",
      }),
    ]);
    expect(groups[0]?.usualAddress).toBe("Newer Place");
  });
});

describe("rsvpBehavior", () => {
  it("splits yes/no/none, auto/manual, and surfaces the attribution gap", () => {
    const behavior = rsvpBehavior([
      // yes + played
      night({}),
      // yes (auto) + night has matches but none theirs — the gap
      night({
        dateKey: "2026-06-10",
        rsvpAuto: true,
        attended: false,
        attendedVia: null,
        matchesPlayedByUser: 0,
        totalMatches: 3,
      }),
      // no
      night({
        dateKey: "2026-05-10",
        rsvp: "no",
        rsvpAuto: false,
        attended: false,
        attendedVia: null,
      }),
      // no response
      night({
        dateKey: "2026-04-10",
        rsvp: null,
        rsvpAuto: null,
        attended: false,
        attendedVia: null,
      }),
    ]);
    expect(behavior).toEqual({
      yes: 2,
      no: 1,
      noResponse: 1,
      autoYes: 1,
      manualYes: 1,
      yesAndPlayed: 1,
      yesWithMatches: 2,
      yesButNoMatch: 1,
    });
  });
});
