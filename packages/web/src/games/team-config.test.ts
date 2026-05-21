import { describe, expect, it } from "vitest";
import { TEAM_GAME_CONFIG, teamConfigForSlug } from "./team-config";

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
