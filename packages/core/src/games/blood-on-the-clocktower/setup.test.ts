import { describe, expect, it } from "vitest";
import type { CharacterId } from "./characters.ts";
import { CHARACTERS } from "./characters.ts";
import {
  addResidentToBag,
  type BagSetup,
  bagCharacterReplacements,
  baronAdjusted,
  baseDistribution,
  chooseDemonBluffs,
  dealBag,
  dealSetup,
  describeDistribution,
  drunkStandInOptions,
  replaceCharacterInBag,
  replaceDrunkStandIn,
  setupFromDraws,
} from "./setup.ts";

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
        // Travellers never come out of the bag — the counter would throw on one.
        const byType = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
        for (const s of setup.seats) byType[CHARACTERS[s.character].type]++;
        expect(byType.traveller).toBe(0);
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

describe("dealBag + setupFromDraws (physical draw flow)", () => {
  it("bag has one token per player; the Drunk's token is their believed Townsfolk", () => {
    for (let seed = 1; seed < 300; seed++) {
      const bag = dealBag(9, seededRng(seed));
      expect(bag.bagTokens).toHaveLength(9);
      expect(bag.charactersInPlay).toHaveLength(9);
      if (!bag.charactersInPlay.includes("drunk")) {
        expect(bag.believedCharacter).toBeUndefined();
        expect(bag.bagTokens).toEqual(bag.charactersInPlay);
        continue;
      }
      const believed = bag.believedCharacter;
      expect(believed).toBeDefined();
      if (!believed) continue;
      expect(CHARACTERS[believed].type).toBe("townsfolk");
      // The physical bag holds the believed token, never the word "Drunk",
      // and the believed token is not otherwise in play.
      expect(bag.bagTokens).not.toContain("drunk");
      expect(bag.bagTokens).toContain(believed);
      expect(bag.charactersInPlay).not.toContain(believed);
      return;
    }
    throw new Error("no Drunk dealt in 300 seeds");
  });

  it("maps the believed token back to the Drunk when recording draws", () => {
    for (let seed = 1; seed < 300; seed++) {
      const bag = dealBag(9, seededRng(seed));
      if (!bag.believedCharacter) continue;
      const recorded = names(9).map((name, i) => ({ name, token: bag.bagTokens[i] }));
      const setup = setupFromDraws(recorded, bag, seededRng(seed + 1));
      const drunkSeat = bag.bagTokens.indexOf(bag.believedCharacter);
      expect(setup.seats[drunkSeat].character).toBe("drunk");
      expect(setup.seats[drunkSeat].believedCharacter).toBe(bag.believedCharacter);
      // Everyone else got exactly the token they drew.
      for (const s of setup.seats) {
        if (s.seat !== drunkSeat) expect(s.character).toBe(bag.bagTokens[s.seat]);
      }
      return;
    }
    throw new Error("no Drunk dealt in 300 seeds");
  });

  it("rejects a draw record that does not cover every resident seat", () => {
    const bag = dealBag(7, seededRng(1));
    const recorded = names(6).map((name, i) => ({ name, token: bag.bagTokens[i] }));
    expect(() => setupFromDraws(recorded, bag, seededRng(2))).toThrow();
  });

  it("seats setup-time travellers in place without a bag draw", () => {
    const bag = dealBag(7, seededRng(3));
    // 8 chairs: seat 2 is a traveller; the 7 residents drew the 7 bag tokens.
    let t = 0;
    const recorded = names(8).map((name, i) =>
      i === 2
        ? { name, traveller: { character: "thief" as const, alignment: "evil" as const } }
        : { name, token: bag.bagTokens[t++] },
    );
    const setup = setupFromDraws(recorded, bag, seededRng(4));
    expect(setup.seats).toHaveLength(8);
    expect(setup.seats[2]).toMatchObject({
      seat: 2,
      character: "thief",
      alignment: "evil",
    });
    // Residents around the traveller keep their tokens and circle positions.
    expect(setup.seats[1].character).toBe(bag.bagTokens[1]);
    expect(setup.seats[3].character).toBe(bag.bagTokens[2]);
    // The traveller can never be the red herring.
    expect(setup.redHerringSeat).not.toBe(2);
  });

  it("rejects duplicate or non-traveller characters on traveller seats", () => {
    const bag = dealBag(5, seededRng(5));
    const base = names(5).map((name, i) => ({ name, token: bag.bagTokens[i] }));
    expect(() =>
      setupFromDraws(
        [
          ...base,
          { name: "T", traveller: { character: "monk" as const, alignment: "good" as const } },
        ],
        bag,
        seededRng(6),
      ),
    ).toThrow();
    expect(() =>
      setupFromDraws(
        [
          ...base,
          { name: "T1", traveller: { character: "thief" as const, alignment: "good" as const } },
          { name: "T2", traveller: { character: "thief" as const, alignment: "evil" as const } },
        ],
        bag,
        seededRng(7),
      ),
    ).toThrow();
  });
});

describe("chooseDemonBluffs", () => {
  // A 7-player game (no outsiders in the base 7p distribution) with the
  // Virgin NOT in play, so it is always in the candidate pool.
  const noOutsiderGame: Parameters<typeof chooseDemonBluffs>[0] = {
    charactersInPlay: ["washerwoman", "chef", "empath", "soldier", "mayor", "poisoner", "imp"],
  };
  const withOutsiderGame: Parameters<typeof chooseDemonBluffs>[0] = {
    charactersInPlay: ["washerwoman", "chef", "empath", "soldier", "butler", "poisoner", "imp"],
  };

  it("returns three unique, good, not-in-play characters", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const bluffs = chooseDemonBluffs(withOutsiderGame, seededRng(seed));
      expect(bluffs).toHaveLength(3);
      expect(new Set(bluffs).size).toBe(3);
      for (const b of bluffs) {
        expect(["townsfolk", "outsider"]).toContain(CHARACTERS[b].type);
        expect(withOutsiderGame.charactersInPlay).not.toContain(b);
      }
    }
  });

  it("never suggests the Virgin — the claim is publicly testable", () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(chooseDemonBluffs(noOutsiderGame, seededRng(seed))).not.toContain("virgin");
      expect(
        chooseDemonBluffs({ ...noOutsiderGame, skill: "experienced" }, seededRng(seed)),
      ).not.toContain("virgin");
    }
  });

  it("skips Outsider bluffs entirely when the Librarian would learn zero", () => {
    const trap: Parameters<typeof chooseDemonBluffs>[0] = {
      charactersInPlay: ["librarian", "chef", "empath", "soldier", "mayor", "poisoner", "imp"],
    };
    for (let seed = 1; seed <= 200; seed++) {
      for (const b of chooseDemonBluffs(trap, seededRng(seed))) {
        expect(CHARACTERS[b].type).toBe("townsfolk");
      }
    }
  });

  it("prefers passive bluffs for a new demon and info bluffs for an experienced one", () => {
    // Slayer/Soldier/Monk out of play alongside Fortune Teller/Undertaker —
    // count which tier each skill level favours over many seeded rolls.
    const game: Parameters<typeof chooseDemonBluffs>[0] = {
      charactersInPlay: ["washerwoman", "chef", "empath", "virgin", "butler", "poisoner", "imp"],
    };
    const count = (skill: "new" | "experienced", id: string) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        if (chooseDemonBluffs({ ...game, skill }, seededRng(seed)).includes(id as never)) n++;
      }
      return n;
    };
    expect(count("new", "soldier")).toBeGreaterThan(count("new", "undertaker"));
    expect(count("experienced", "undertaker")).toBeGreaterThan(count("experienced", "soldier"));
  });
});

describe("describeDistribution", () => {
  it("reads like the setup sheet", () => {
    expect(describeDistribution(baseDistribution(6))).toBe(
      "3 Townsfolk · 1 Outsider · 1 Minion · 1 Demon",
    );
  });
});

describe("editing a rolled bag", () => {
  // A hand-built 7-player TB bag (5/0/1/1) — no Drunk, no Baron.
  const plainBag = (): BagSetup => ({
    edition: "trouble-brewing",
    charactersInPlay: ["chef", "empath", "monk", "washerwoman", "soldier", "poisoner", "imp"],
    bagTokens: ["chef", "empath", "monk", "washerwoman", "soldier", "poisoner", "imp"],
    distribution: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
    demonBluffs: ["slayer", "mayor", "ravenkeeper"],
  });
  // An 8-player TB bag (5/1/1/1) with the Drunk in play as its Outsider.
  const drunkBag = (): BagSetup => ({
    edition: "trouble-brewing",
    charactersInPlay: [
      "chef",
      "empath",
      "monk",
      "washerwoman",
      "soldier",
      "drunk",
      "poisoner",
      "imp",
    ],
    bagTokens: ["chef", "empath", "monk", "washerwoman", "soldier", "librarian", "poisoner", "imp"],
    believedCharacter: "librarian",
    distribution: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
    demonBluffs: ["slayer", "mayor", "ravenkeeper"],
  });
  // A 10-player BMR bag (7/0/2/1) with the Lunatic swapped in for testing.
  const lunaticBag = (): BagSetup => ({
    edition: "bad-moon-rising",
    charactersInPlay: [
      "grandmother",
      "sailor",
      "chambermaid",
      "exorcist",
      "gambler",
      "courtier",
      "lunatic",
      "assassin",
      "mastermind",
      "pukka",
    ],
    bagTokens: [
      "grandmother",
      "sailor",
      "chambermaid",
      "exorcist",
      "gambler",
      "courtier",
      "lunatic",
      "assassin",
      "mastermind",
      "pukka",
    ],
    lunaticDemon: "pukka",
    distribution: { townsfolk: 6, outsiders: 1, minions: 2, demons: 1 },
    demonBluffs: ["gossip", "innkeeper", "goon"],
  });

  describe("bagCharacterReplacements", () => {
    it("offers same-type, not-in-play characters and never the Baron/Godfather", () => {
      const options = bagCharacterReplacements(plainBag(), "poisoner");
      expect(options).toContain("spy");
      expect(options).toContain("scarlet-woman");
      expect(options).not.toContain("baron");
      expect(options).not.toContain("poisoner");
      for (const id of options) expect(CHARACTERS[id].type).toBe("minion");
    });

    it("is empty for the Baron (composition-changing) and the TB Demon (no alternative)", () => {
      const bag = plainBag();
      bag.charactersInPlay[5] = "baron";
      bag.bagTokens[5] = "baron";
      expect(bagCharacterReplacements(bag, "baron")).toEqual([]);
      expect(bagCharacterReplacements(plainBag(), "imp")).toEqual([]);
    });

    it("never offers the Drunk's stand-in as a Townsfolk swap target", () => {
      expect(bagCharacterReplacements(drunkBag(), "chef")).not.toContain("librarian");
    });
  });

  describe("replaceCharacterInBag", () => {
    it("swaps a same-type character, keeping counts and everything else", () => {
      const next = replaceCharacterInBag(plainBag(), "chef", "librarian", { rng: seededRng(1) });
      expect(next.charactersInPlay).toContain("librarian");
      expect(next.charactersInPlay).not.toContain("chef");
      expect(next.bagTokens).toHaveLength(7);
      expect(next.distribution).toEqual(plainBag().distribution);
      expect(next.demonBluffs).toEqual(plainBag().demonBluffs); // no collision → untouched
    });

    it("rejects cross-type and in-play targets", () => {
      expect(() => replaceCharacterInBag(plainBag(), "chef", "poisoner")).toThrow();
      expect(() => replaceCharacterInBag(plainBag(), "chef", "empath")).toThrow();
    });

    it("swapping the Drunk in rolls a stand-in; out retires it", () => {
      const bag = plainBag();
      bag.charactersInPlay[4] = "saint";
      bag.bagTokens[4] = "saint";
      const withDrunk = replaceCharacterInBag(bag, "saint", "drunk", { rng: seededRng(3) });
      expect(withDrunk.charactersInPlay).toContain("drunk");
      expect(withDrunk.believedCharacter).toBeDefined();
      expect(CHARACTERS[withDrunk.believedCharacter as CharacterId].type).toBe("townsfolk");
      expect(withDrunk.bagTokens).not.toContain("drunk");
      expect(withDrunk.bagTokens).toContain(withDrunk.believedCharacter);

      const without = replaceCharacterInBag(drunkBag(), "drunk", "recluse", { rng: seededRng(3) });
      expect(without.believedCharacter).toBeUndefined();
      expect(without.bagTokens).toContain("recluse");
      expect(without.bagTokens).not.toContain("librarian");
    });

    it("swapping the Lunatic out clears the demon swap; a Demon swap follows it (BMR)", () => {
      const out = replaceCharacterInBag(lunaticBag(), "lunatic", "goon", { rng: seededRng(5) });
      expect(out.lunaticDemon).toBeUndefined();
      // goon was a bluff → bluffs must be re-rolled without it.
      expect(out.demonBluffs).not.toContain("goon");

      const demonSwap = replaceCharacterInBag(lunaticBag(), "pukka", "po", { rng: seededRng(5) });
      expect(demonSwap.lunaticDemon).toBe("po");
      expect(demonSwap.charactersInPlay).toContain("po");
    });

    it("re-rolls bluffs when the new character was one", () => {
      const next = replaceCharacterInBag(plainBag(), "chef", "slayer", { rng: seededRng(7) });
      expect(next.demonBluffs).not.toContain("slayer");
      expect(next.demonBluffs).toHaveLength(3);
      for (const b of next.demonBluffs) expect(next.charactersInPlay).not.toContain(b);
    });
  });

  describe("replaceDrunkStandIn", () => {
    it("changes the stand-in token only", () => {
      const options = drunkStandInOptions(drunkBag());
      expect(options).toContain("undertaker");
      expect(options).not.toContain("librarian");
      expect(options).not.toContain("chef");
      const next = replaceDrunkStandIn(drunkBag(), "undertaker", { rng: seededRng(1) });
      expect(next.believedCharacter).toBe("undertaker");
      expect(next.bagTokens).toContain("undertaker");
      expect(next.bagTokens).not.toContain("librarian");
      expect(next.charactersInPlay).toEqual(drunkBag().charactersInPlay);
    });

    it("has no options without a Drunk in play", () => {
      expect(drunkStandInOptions(plainBag())).toEqual([]);
      expect(() => replaceDrunkStandIn(plainBag(), "undertaker")).toThrow();
    });
  });

  describe("addResidentToBag", () => {
    it("reshapes any rolled bag to the next count's distribution (both editions)", () => {
      for (const edition of ["trouble-brewing", "bad-moon-rising"] as const) {
        for (let n = 5; n <= 14; n++) {
          for (let seed = 1; seed <= 6; seed++) {
            const bag = dealBag(n, seededRng(seed * 131 + n), "new", edition);
            const result = addResidentToBag(bag, { rng: seededRng(seed) });
            const next = result.bag;
            expect(next.bagTokens).toHaveLength(n + 1);
            const byType = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
            for (const id of next.charactersInPlay) byType[CHARACTERS[id].type]++;
            expect(byType.townsfolk).toBe(next.distribution.townsfolk);
            expect(byType.outsider).toBe(next.distribution.outsiders);
            expect(byType.minion).toBe(next.distribution.minions);
            expect(byType.demon).toBe(1);
            // added/removed exactly reconcile the old bag into the new one.
            const expected = new Set(bag.charactersInPlay);
            for (const id of result.removed) expected.delete(id);
            for (const id of result.added) expected.add(id);
            expect(new Set(next.charactersInPlay)).toEqual(expected);
            // No duplicates, and bluffs stay legal.
            expect(new Set(next.charactersInPlay).size).toBe(next.charactersInPlay.length);
            for (const b of next.demonBluffs) {
              expect(next.charactersInPlay).not.toContain(b);
              expect(b).not.toBe(next.believedCharacter);
            }
          }
        }
      }
    });

    it("never auto-adds the Baron/Godfather, and completes a last-resort Drunk/Lunatic", () => {
      for (const edition of ["trouble-brewing", "bad-moon-rising"] as const) {
        for (let n = 5; n <= 14; n++) {
          for (let seed = 1; seed <= 6; seed++) {
            const bag = dealBag(n, seededRng(seed * 17 + n), "new", edition);
            const { bag: next, added } = addResidentToBag(bag, { rng: seededRng(seed) });
            expect(added).not.toContain("baron");
            expect(added).not.toContain("godfather");
            // Drunk/Lunatic are allowed only as a last resort, and always
            // arrive with their bookkeeping completed.
            if (added.includes("drunk" as CharacterId)) {
              expect(next.believedCharacter).toBeDefined();
              expect(next.bagTokens).not.toContain("drunk");
            }
            if (added.includes("lunatic" as CharacterId)) {
              expect(next.lunaticDemon).toBeDefined();
            }
          }
        }
      }
    });

    it("prefers removing tokens nobody has drawn yet", () => {
      // Baron-adjusted 6-player bag (1/3/1/1) → 7 players (3/2/1/1): one of
      // three Outsiders must go; the two already-drawn ones must survive.
      const bag: BagSetup = {
        edition: "trouble-brewing",
        charactersInPlay: ["chef", "butler", "recluse", "saint", "baron", "imp"],
        bagTokens: ["chef", "butler", "recluse", "saint", "baron", "imp"],
        distribution: { townsfolk: 1, outsiders: 3, minions: 1, demons: 1 },
        demonBluffs: ["slayer", "mayor", "ravenkeeper"],
      };
      for (let seed = 1; seed <= 20; seed++) {
        const { removed } = addResidentToBag(bag, {
          rng: seededRng(seed),
          avoidRemoving: ["butler", "recluse"],
        });
        expect(removed).toEqual(["saint"]);
      }
    });

    it("clears the Drunk when the reshape removes them", () => {
      // 6-player bag whose sole Outsider is the Drunk → 7 players drops all
      // Outsiders, so the Drunk and their stand-in must both go.
      const bag: BagSetup = {
        edition: "trouble-brewing",
        charactersInPlay: ["chef", "empath", "monk", "drunk", "poisoner", "imp"],
        bagTokens: ["chef", "empath", "monk", "librarian", "poisoner", "imp"],
        believedCharacter: "librarian",
        distribution: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
        demonBluffs: ["slayer", "mayor", "ravenkeeper"],
      };
      const { bag: next, removed } = addResidentToBag(bag, { rng: seededRng(9) });
      expect(removed).toContain("drunk");
      expect(next.believedCharacter).toBeUndefined();
      expect(next.bagTokens).not.toContain("librarian");
    });

    it("throws at the 15-player cap", () => {
      expect(() => addResidentToBag(dealBag(15, seededRng(1)), { rng: seededRng(1) })).toThrow();
    });
  });
});
