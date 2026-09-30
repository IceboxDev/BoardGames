import { describe, expect, it } from "vitest";
import { SKILL_TRAIT_IDS } from "../protocol/http/skills.ts";
import {
  balanceTeams,
  gameStrength,
  type StrengthSource,
  TOLERANCE,
  teamChances,
  teamSizes,
} from "./team-balance.ts";

const player = (theta: number, games: StrengthSource["games"] = {}): StrengthSource => ({
  traits: Object.fromEntries(
    SKILL_TRAIT_IDS.map((t) => [t, { theta }]),
  ) as StrengthSource["traits"],
  games,
});

describe("gameStrength", () => {
  it("mixes the game's traits, adds the player's own offset once they've played it", () => {
    const p = player(0.5, { codenames: { offset: 0.2, matches: 4 } });
    expect(gameStrength(p, "codenames")).toEqual({ strength: 0.7, basis: "game" });
    expect(gameStrength(p, "decrypto")).toEqual({ strength: 0.5, basis: "traits" });
    expect(gameStrength(undefined, "codenames")).toEqual({ strength: 0, basis: "unknown" });
  });

  it("weighs the traits the game asks for", () => {
    const p = player(0);
    p.traits.soc.theta = 1;
    // Codenames leans social more than Set does.
    expect(gameStrength(p, "codenames").strength).toBeGreaterThan(gameStrength(p, "set").strength);
  });
});

describe("teamSizes / teamChances", () => {
  it("splits as evenly as possible", () => {
    expect(teamSizes(7, 2)).toEqual([4, 3]);
    expect(teamSizes(10, 3)).toEqual([4, 3, 3]);
    expect(teamSizes(3, 5)).toEqual([1, 1, 1]);
  });

  it("gives Bradley–Terry chances that sum to one", () => {
    const [a, b] = teamChances([0.4, 0]);
    expect(a).toBeCloseTo(1 / (1 + Math.exp(-0.4)));
    expect(a + b).toBeCloseTo(1);
    expect(teamChances([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
});

describe("balanceTeams", () => {
  const strengths: Record<string, number> = {
    ace: 2,
    bee: 1.5,
    cat: 1,
    dan: 0.2,
    eve: 0,
    fox: -0.4,
    gus: -1,
    hal: -1.5,
  };
  const ids = Object.keys(strengths);
  const of = (id: string) => strengths[id];

  it("finds a split far fairer than chance, with everyone placed once", () => {
    const res = balanceTeams(ids, 2, of, 1);
    expect(res.teams.map((t) => t.length).sort()).toEqual([4, 4]);
    expect(new Set(res.teams.flat())).toEqual(new Set(ids));
    // The best possible split here is 0.05 apart (ace+dan+fox+gus vs …);
    // any split inside the tolerance band above it is fair game.
    expect(res.spread).toBeLessThanOrEqual(0.05 + TOLERANCE + 1e-9);
    expect(res.chances[0]).toBeGreaterThan(0.48);
    expect(res.chances[0]).toBeLessThan(0.52);
    // The two strongest never end up together.
    expect(res.teams.some((t) => t.includes("ace") && t.includes("bee"))).toBe(false);
  });

  it("is deterministic per seed and varies across seeds among fair splits", () => {
    expect(balanceTeams(ids, 2, of, 7)).toEqual(balanceTeams(ids, 2, of, 7));
    const seen = new Set(
      Array.from({ length: 12 }, (_, s) =>
        JSON.stringify(
          balanceTeams(ids, 2, of, s)
            .teams.map((t) => [...t].sort())
            .sort(),
        ),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("balances several teams and odd sizes with the swap search", () => {
    const many = Array.from({ length: 13 }, (_, i) => `p${i}`);
    const r = (id: string) => Number(id.slice(1)) / 4 - 1.5;
    const res = balanceTeams(many, 3, r, 3);
    expect(res.teams.map((t) => t.length).sort()).toEqual([4, 4, 5]);
    expect(res.spread).toBeLessThan(0.15);
    expect(res.chances.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("handles 18 players in two teams (beyond the exact search)", () => {
    const many = Array.from({ length: 18 }, (_, i) => `p${i}`);
    const res = balanceTeams(many, 2, (id) => Math.sin(Number(id.slice(1))), 5);
    expect(res.teams.map((t) => t.length)).toEqual([9, 9]);
    expect(res.spread).toBeLessThan(0.1);
  });

  it("copes with an empty or tiny pool", () => {
    expect(balanceTeams([], 2, of, 1).teams).toEqual([]);
    expect(balanceTeams(["ace", "bee"], 2, of, 1).teams.map((t) => t.length)).toEqual([1, 1]);
  });
});
