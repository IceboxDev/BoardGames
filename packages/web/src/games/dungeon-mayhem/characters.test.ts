import { describe, expect, it } from "vitest";
import { DUNGEON_MAYHEM_SET_LABELS, DUNGEON_MAYHEM_SETS, heroesForSets } from "./characters";

describe("heroesForSets", () => {
  it("returns just the four Standard heroes for Standard only", () => {
    expect(heroesForSets(["Standard"])).toEqual(["Sutha", "Azzan", "Lia", "Oriax"]);
  });

  it("unions selected sets in canonical order regardless of input order", () => {
    expect(heroesForSets(["Monster Madness", "Standard"])).toEqual([
      "Sutha",
      "Azzan",
      "Lia",
      "Oriax",
      "Lord Cinderpuff",
      "Hoots McGoots",
      "Dr. Tentaculous",
      "Blorp",
      "Delilah Deathray",
      "Mimi LeChaise",
    ]);
  });

  it("supports an expansion-only selection (Baldur's Gate duel)", () => {
    expect(heroesForSets(["Battle for Baldur's Gate"])).toEqual(["Jaheira", "Minsc & Boo"]);
  });

  it("falls back to every hero when nothing valid is selected", () => {
    const all = DUNGEON_MAYHEM_SET_LABELS.flatMap((s) => DUNGEON_MAYHEM_SETS[s]);
    expect(heroesForSets([])).toEqual(all);
    expect(heroesForSets(["Not A Set"])).toEqual(all);
  });
});

describe("DUNGEON_MAYHEM_SETS", () => {
  it("lists the three sets as labels", () => {
    expect(DUNGEON_MAYHEM_SET_LABELS).toEqual([
      "Standard",
      "Battle for Baldur's Gate",
      "Monster Madness",
    ]);
  });

  it("has no hero shared between sets (decks are unique)", () => {
    const seen = new Set<string>();
    for (const set of DUNGEON_MAYHEM_SET_LABELS) {
      for (const hero of DUNGEON_MAYHEM_SETS[set]) {
        expect(seen.has(hero), `"${hero}" appears in more than one set`).toBe(false);
        seen.add(hero);
      }
    }
  });
});
