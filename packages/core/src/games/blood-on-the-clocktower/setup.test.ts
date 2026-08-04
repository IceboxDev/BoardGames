import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { baronAdjusted, baseDistribution, dealSetup, describeDistribution } from "./setup.ts";

// Deterministic LCG so every draw is reproducible.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const names = (n: number) => Array.from({ length: n }, (_, i) => `Player ${i + 1}`);

describe("baseDistribution", () => {
  it("matches the setup sheet for 5–15 players", () => {
    expect(baseDistribution(5)).toEqual({ townsfolk: 3, outsiders: 0, minions: 1, demons: 1 });
    expect(baseDistribution(7)).toEqual({ townsfolk: 5, outsiders: 0, minions: 1, demons: 1 });
    expect(baseDistribution(9)).toEqual({ townsfolk: 5, outsiders: 2, minions: 1, demons: 1 });
    expect(baseDistribution(10)).toEqual({ townsfolk: 7, outsiders: 0, minions: 2, demons: 1 });
    expect(baseDistribution(13)).toEqual({ townsfolk: 9, outsiders: 0, minions: 3, demons: 1 });
    expect(baseDistribution(15)).toEqual({ townsfolk: 9, outsiders: 2, minions: 3, demons: 1 });
  });

  it("throws outside 5–15", () => {
    expect(() => baseDistribution(4)).toThrow();
    expect(() => baseDistribution(16)).toThrow();
  });

  it("every distribution sums to the player count", () => {
    for (let n = 5; n <= 15; n++) {
      const d = baseDistribution(n);
      expect(d.townsfolk + d.outsiders + d.minions + d.demons).toBe(n);
    }
  });
});

describe("baronAdjusted", () => {
  it("trades two Townsfolk for two Outsiders", () => {
    expect(baronAdjusted(baseDistribution(7))).toEqual({
      townsfolk: 3,
      outsiders: 2,
      minions: 1,
      demons: 1,
    });
  });
});

describe("dealSetup", () => {
  it("deals exactly one character per seat with the right type counts", () => {
    for (let n = 5; n <= 15; n++) {
      for (let seed = 1; seed <= 10; seed++) {
        const setup = dealSetup(names(n), seededRng(seed * 97 + n));
        expect(setup.seats).toHaveLength(n);
        const byType = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
        for (const s of setup.seats) byType[CHARACTERS[s.character].type]++;
        expect(byType.townsfolk).toBe(setup.distribution.townsfolk);
        expect(byType.outsider).toBe(setup.distribution.outsiders);
        expect(byType.minion).toBe(setup.distribution.minions);
        expect(byType.demon).toBe(1);
        // No duplicate characters.
        expect(new Set(setup.seats.map((s) => s.character)).size).toBe(n);
      }
    }
  });

  it("applies the Baron's +2 Outsiders when the Baron is dealt", () => {
    for (let seed = 1; seed < 200; seed++) {
      const setup = dealSetup(names(10), seededRng(seed));
      const hasBaron = setup.seats.some((s) => s.character === "baron");
      const base = baseDistribution(10);
      if (hasBaron) {
        expect(setup.distribution.outsiders).toBe(base.outsiders + 2);
        expect(setup.distribution.townsfolk).toBe(base.townsfolk - 2);
      } else {
        expect(setup.distribution).toEqual(base);
      }
    }
  });

  it("gives the Drunk a believed Townsfolk that is not in play", () => {
    for (let seed = 1; seed < 300; seed++) {
      const setup = dealSetup(names(9), seededRng(seed));
      const drunk = setup.seats.find((s) => s.character === "drunk");
      if (!drunk) continue;
      expect(drunk.believedCharacter).toBeDefined();
      const believed = drunk.believedCharacter;
      if (!believed) continue;
      expect(CHARACTERS[believed].type).toBe("townsfolk");
      expect(setup.seats.some((s) => s.character === believed)).toBe(false);
      return; // saw at least one Drunk game — good
    }
    throw new Error("no Drunk dealt in 300 seeds");
  });

  it("demon bluffs are three good, not-in-play characters", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const setup = dealSetup(names(12), seededRng(seed));
      expect(setup.demonBluffs).toHaveLength(3);
      for (const bluff of setup.demonBluffs) {
        expect(["townsfolk", "outsider"]).toContain(CHARACTERS[bluff].type);
        expect(setup.seats.some((s) => s.character === bluff)).toBe(false);
        const drunk = setup.seats.find((s) => s.character === "drunk");
        if (drunk) expect(bluff).not.toBe(drunk.believedCharacter);
      }
      expect(new Set(setup.demonBluffs).size).toBe(3);
    }
  });

  it("picks a good red herring exactly when the Fortune Teller is in play", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const setup = dealSetup(names(8), seededRng(seed));
      const ft = setup.seats.some((s) => s.character === "fortune-teller");
      if (ft) {
        expect(setup.redHerringSeat).toBeDefined();
        const seat = setup.seats.find((s) => s.seat === setup.redHerringSeat);
        expect(seat).toBeDefined();
        if (seat) {
          expect(["townsfolk", "outsider"]).toContain(CHARACTERS[seat.character].type);
        }
      } else {
        expect(setup.redHerringSeat).toBeUndefined();
      }
    }
  });
});

describe("describeDistribution", () => {
  it("reads like the setup sheet", () => {
    expect(describeDistribution(baseDistribution(6))).toBe(
      "3 Townsfolk · 1 Outsider · 1 Minion · 1 Demon",
    );
  });
});
