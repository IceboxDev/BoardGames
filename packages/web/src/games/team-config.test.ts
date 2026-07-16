import { describe, expect, it } from "vitest";
import {
  allowsMultipleRoles,
  joinMemberRoles,
  splitMemberRoles,
  TEAM_GAME_CONFIG,
  teamConfigForSlug,
} from "./team-config";

describe("teamConfigForSlug", () => {
  it("returns an empty config when slug is null", () => {
    expect(teamConfigForSlug(null)).toEqual({});
  });

  it("returns an empty config when slug is unknown", () => {
    expect(teamConfigForSlug("not-a-real-game")).toEqual({});
  });

  it("returns the Codenames config with Spymaster/Operative roles + lead role", () => {
    const config = teamConfigForSlug("codenames");
    expect(config.memberRoles).toEqual(["Spymaster", "Operative"]);
    expect(config.leadRole).toEqual({ primary: "Spymaster", fallback: "Operative" });
  });

  it("Codenames Pictures shares the Codenames team shape", () => {
    expect(teamConfigForSlug("codenames-pictures")).toEqual(teamConfigForSlug("codenames"));
  });

  it("Decrypto config has scores but no role chips", () => {
    const config = teamConfigForSlug("decrypto");
    expect(config.hasScores).toBe(true);
    expect(config.memberRoles).toBeUndefined();
  });

  it("Wavelength config uses autoWinner=highest with scores", () => {
    const config = teamConfigForSlug("wavelength");
    expect(config.hasScores).toBe(true);
    expect(config.autoWinner).toBe("highest");
  });

  it("Captain Sonar has the four submarine seat roles", () => {
    const config = teamConfigForSlug("captain-sonar");
    expect(config.memberRoles).toEqual(["Captain", "First Mate", "Engineer", "Radio Operator"]);
  });

  it("every leadRole declares both primary and fallback strings", () => {
    for (const [slug, config] of Object.entries(TEAM_GAME_CONFIG)) {
      if (!config.leadRole) continue;
      expect(config.leadRole.primary, `${slug}.leadRole.primary`).toBeTruthy();
      expect(config.leadRole.fallback, `${slug}.leadRole.fallback`).toBeTruthy();
    }
  });

  it("autoWinner is always 'highest' or 'lowest' when present", () => {
    for (const [slug, config] of Object.entries(TEAM_GAME_CONFIG)) {
      if (!config.autoWinner) continue;
      expect(["highest", "lowest"], `${slug}.autoWinner`).toContain(config.autoWinner);
    }
  });
});

describe("allowsMultipleRoles", () => {
  const sonar = teamConfigForSlug("captain-sonar");

  it("is on for an undermanned Captain Sonar sub (fewer members than seats)", () => {
    expect(allowsMultipleRoles(sonar, 1)).toBe(true);
    expect(allowsMultipleRoles(sonar, 2)).toBe(true);
    expect(allowsMultipleRoles(sonar, 3)).toBe(true);
  });

  it("is off once every seat can be individually crewed", () => {
    expect(allowsMultipleRoles(sonar, 4)).toBe(false);
    expect(allowsMultipleRoles(sonar, 5)).toBe(false);
  });

  it("stays off for leadRole games (Codenames) regardless of team size", () => {
    expect(allowsMultipleRoles(teamConfigForSlug("codenames"), 1)).toBe(false);
  });

  it("is off for games without role chips", () => {
    expect(allowsMultipleRoles(teamConfigForSlug("decrypto"), 1)).toBe(false);
    expect(allowsMultipleRoles({}, 1)).toBe(false);
  });
});

describe("splitMemberRoles / joinMemberRoles", () => {
  const SEATS = ["Captain", "First Mate", "Engineer", "Radio Operator"];

  it("round-trips a multi-seat selection in config order", () => {
    const joined = joinMemberRoles(["Engineer", "Captain"], SEATS);
    expect(joined).toBe("Captain + Engineer");
    expect(splitMemberRoles(joined)).toEqual(["Captain", "Engineer"]);
  });

  it("splits undefined/empty to no seats and joins no seats to undefined", () => {
    expect(splitMemberRoles(undefined)).toEqual([]);
    expect(splitMemberRoles("")).toEqual([]);
    expect(joinMemberRoles([], SEATS)).toBeUndefined();
  });

  it("treats a plain single role as a one-seat selection", () => {
    expect(splitMemberRoles("Captain")).toEqual(["Captain"]);
  });

  it("all four Captain Sonar seats joined stay within the 64-char role cap", () => {
    const all = joinMemberRoles(SEATS, SEATS);
    expect(all).toBe("Captain + First Mate + Engineer + Radio Operator");
    expect(all?.length ?? 0).toBeLessThanOrEqual(64);
  });
});
