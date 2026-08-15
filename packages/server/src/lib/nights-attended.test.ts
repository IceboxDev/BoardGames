import { describe, expect, it } from "vitest";
import { attributeNightsAttended, countNightsAttended } from "./nights-attended.ts";

const night = (n: number) => `2026-07-${String(n).padStart(2, "0")}`;

describe("countNightsAttended", () => {
  it("counts an RSVP-yes night with no recorded matches", () => {
    expect(
      countNightsAttended({
        pastNights: [night(1)],
        rsvpYesNights: new Set([night(1)]),
        nightsWithMatches: new Set(),
        playedNights: new Set(),
      }),
    ).toBe(1);
  });

  it("denies an RSVP-yes night whose matches all exclude the user", () => {
    expect(
      countNightsAttended({
        pastNights: [night(1)],
        rsvpYesNights: new Set([night(1)]),
        nightsWithMatches: new Set([night(1)]),
        playedNights: new Set(),
      }),
    ).toBe(0);
  });

  it("counts a played night even without an RSVP", () => {
    expect(
      countNightsAttended({
        pastNights: [night(1)],
        rsvpYesNights: new Set(),
        nightsWithMatches: new Set([night(1)]),
        playedNights: new Set([night(1)]),
      }),
    ).toBe(1);
  });

  it("never counts a night outside the past locked set", () => {
    expect(
      countNightsAttended({
        pastNights: [],
        rsvpYesNights: new Set([night(1)]),
        nightsWithMatches: new Set([night(2)]),
        playedNights: new Set([night(2)]),
      }),
    ).toBe(0);
  });

  it("combines all three rules across distinct nights", () => {
    expect(
      countNightsAttended({
        // 1: played; 2: rsvp + no matches; 3: rsvp contradicted; 4: nothing
        pastNights: [night(1), night(2), night(3), night(4)],
        rsvpYesNights: new Set([night(2), night(3)]),
        nightsWithMatches: new Set([night(1), night(3)]),
        playedNights: new Set([night(1)]),
      }),
    ).toBe(2);
  });
});

describe("attributeNightsAttended", () => {
  it("labels each night with how the credit was earned", () => {
    const byNight = attributeNightsAttended({
      // 1: played; 2: rsvp + no matches; 3: rsvp contradicted (the deliberate
      // gap — matches exist, none include the user); 4: nothing at all
      pastNights: [night(1), night(2), night(3), night(4)],
      rsvpYesNights: new Set([night(2), night(3)]),
      nightsWithMatches: new Set([night(1), night(3)]),
      playedNights: new Set([night(1)]),
    });
    expect(byNight.get(night(1))).toBe("played");
    expect(byNight.get(night(2))).toBe("rsvp");
    expect(byNight.get(night(3))).toBeNull();
    expect(byNight.get(night(4))).toBeNull();
  });

  it("prefers played over rsvp when both would apply", () => {
    const byNight = attributeNightsAttended({
      pastNights: [night(1)],
      rsvpYesNights: new Set([night(1)]),
      nightsWithMatches: new Set([night(1)]),
      playedNights: new Set([night(1)]),
    });
    expect(byNight.get(night(1))).toBe("played");
  });

  it("covers every past night, one entry each", () => {
    const byNight = attributeNightsAttended({
      pastNights: [night(1), night(2)],
      rsvpYesNights: new Set(),
      nightsWithMatches: new Set(),
      playedNights: new Set(),
    });
    expect([...byNight.keys()]).toEqual([night(1), night(2)]);
  });
});
