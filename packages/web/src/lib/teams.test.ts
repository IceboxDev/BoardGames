import { createRng } from "@boardgames/core/lib/rng";
import { afterEach, describe, expect, it } from "vitest";
import type { Attendee } from "./calendar-games";
import {
  DEFAULT_TEAMS_STATE,
  dealTeams,
  defaultInPool,
  isTeamCandidate,
  loadTeams,
  saveTeams,
  splitCaption,
  teamCountBounds,
} from "./teams";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);

describe("dealTeams", () => {
  it("balances sizes within one and places everyone exactly once", () => {
    for (let n = 2; n <= 12; n++) {
      for (let count = 2; count <= Math.max(2, Math.floor(n / 2)); count++) {
        const teams = dealTeams(ids(n), count, createRng(n * 31 + count));
        expect(teams).toHaveLength(count);
        const sizes = teams.map((t) => t.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(teams.flat().sort()).toEqual(ids(n).sort());
      }
    }
  });

  it("is deterministic for a seed", () => {
    expect(dealTeams(ids(8), 3, createRng(7))).toEqual(dealTeams(ids(8), 3, createRng(7)));
  });

  it("never makes more teams than players", () => {
    expect(dealTeams(ids(3), 5, createRng(1))).toHaveLength(3);
  });
});

describe("pool defaults", () => {
  const person = (over: Partial<Attendee>): Attendee => ({
    userId: "a",
    name: "A",
    isHost: false,
    isAdmin: false,
    status: "definite",
    hasRsvped: true,
    isGuest: false,
    votes: { hype: 0, teach: 0, learn: 0 },
    bringing: [],
    seat: null,
    ...over,
  });

  it("open night: confirmed in, maybe out", () => {
    expect(defaultInPool(person({ status: "definite" }))).toBe(true);
    expect(defaultInPool(person({ status: "tentative" }))).toBe(false);
  });

  it("private night: host and seated in, waitlist out, invited/declined not offered", () => {
    expect(defaultInPool(person({ seat: "host" }))).toBe(true);
    expect(defaultInPool(person({ seat: "seated" }))).toBe(true);
    expect(defaultInPool(person({ seat: "waitlisted", status: "tentative" }))).toBe(false);
    expect(isTeamCandidate(person({ seat: "waitlisted" }))).toBe(true);
    expect(isTeamCandidate(person({ seat: "invited" }))).toBe(false);
    expect(isTeamCandidate(person({ seat: "declined" }))).toBe(false);
  });
});

describe("bounds and caption", () => {
  it("keeps at least two per team when possible", () => {
    expect(teamCountBounds(3)).toEqual({ min: 2, max: 2 });
    expect(teamCountBounds(9)).toEqual({ min: 2, max: 4 });
  });

  it("reads the split back", () => {
    expect(splitCaption(8, 3)).toBe("3 + 3 + 2");
    expect(splitCaption(8, 2)).toBe("4 + 4");
    expect(splitCaption(0, 2)).toBe("Nobody in the pool");
  });
});

describe("storage", () => {
  afterEach(() => window.localStorage.clear());

  it("round-trips per night", () => {
    const state = { teamCount: 3, overrides: { u1: true }, teams: [["u1"], ["u2"], ["u3"]] };
    saveTeams("2026-09-26", state);
    expect(loadTeams("2026-09-26")).toEqual(state);
    expect(loadTeams("2026-09-27")).toEqual(DEFAULT_TEAMS_STATE);
  });

  it("falls back to the default on a corrupt entry", () => {
    window.localStorage.setItem("bg:teams:2026-09-26", "{not json");
    expect(loadTeams("2026-09-26")).toEqual(DEFAULT_TEAMS_STATE);
    window.localStorage.setItem("bg:teams:2026-09-26", JSON.stringify({ teamCount: "x" }));
    expect(loadTeams("2026-09-26")).toEqual(DEFAULT_TEAMS_STATE);
  });
});
