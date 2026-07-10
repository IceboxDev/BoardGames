import { describe, expect, it } from "vitest";
import { CARDS, GUILDS } from "./cards";
import type { CardDef } from "./types";
import { WONDERS } from "./wonders";

function deckSize(cards: readonly CardDef[], playerCount: number): number {
  return cards.reduce((sum, card) => sum + card.copies.filter((n) => n <= playerCount).length, 0);
}

describe("card data", () => {
  const byAge = (age: number) => CARDS.filter((c) => c.age === age);

  it.each([3, 4, 5, 6, 7])("age I deck has 7 cards per player at %i players", (n) => {
    expect(deckSize(byAge(1), n)).toBe(7 * n);
  });

  it.each([3, 4, 5, 6, 7])("age II deck has 7 cards per player at %i players", (n) => {
    expect(deckSize(byAge(2), n)).toBe(7 * n);
  });

  it.each([
    3, 4, 5, 6, 7,
  ])("age III non-guild cards + (n+2) guilds total 7 per player at %i players", (n) => {
    expect(deckSize(byAge(3), n) + (n + 2)).toBe(7 * n);
  });

  it("has exactly 10 guilds, all purple age III", () => {
    expect(GUILDS).toHaveLength(10);
    for (const g of GUILDS) {
      expect(g.color).toBe("purple");
      expect(g.age).toBe(3);
    }
  });

  it("card names are unique within each age", () => {
    for (const age of [1, 2, 3] as const) {
      const names = byAge(age).map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("every chainFrom references a card from an earlier age", () => {
    for (const card of [...CARDS, ...GUILDS]) {
      for (const from of card.chainFrom ?? []) {
        const provider = CARDS.find((c) => c.name === from && c.age < card.age);
        expect(provider, `${card.name} chains from unknown/later card ${from}`).toBeDefined();
      }
    }
  });

  it("copies arrays are ascending player counts in 3..7", () => {
    for (const card of [...CARDS, ...GUILDS]) {
      expect(card.copies.length).toBeGreaterThan(0);
      for (let i = 0; i < card.copies.length; i++) {
        expect(card.copies[i]).toBeGreaterThanOrEqual(3);
        expect(card.copies[i]).toBeLessThanOrEqual(7);
        if (i > 0) expect(card.copies[i]).toBeGreaterThan(card.copies[i - 1]);
      }
    }
  });

  it("guilds are singletons available from 3 players", () => {
    for (const g of GUILDS) expect(g.copies).toEqual([3]);
  });
});

describe("wonder data", () => {
  it("has all 7 wonders with A and B sides", () => {
    expect(WONDERS).toHaveLength(7);
    const ids = WONDERS.map((w) => w.id);
    expect(new Set(ids).size).toBe(7);
  });

  it("each side has 2-4 stages with well-formed costs", () => {
    for (const wonder of WONDERS) {
      for (const side of [wonder.sides.A, wonder.sides.B]) {
        expect(side.stages.length).toBeGreaterThanOrEqual(2);
        expect(side.stages.length).toBeLessThanOrEqual(4);
        for (const stage of side.stages) {
          expect(stage.effects.length).toBeGreaterThan(0);
          const units = Object.values(stage.cost.resources ?? {}).reduce((a, b) => a + b, 0);
          expect(units).toBeGreaterThan(0);
        }
      }
    }
  });

  it("A sides total 3 stages except Rhodes B-style variants", () => {
    for (const wonder of WONDERS) {
      expect(wonder.sides.A.stages).toHaveLength(3);
    }
    // B sides vary: Rhodes B has 2, Giza B has 4, the rest have 3.
    expect(WONDERS.find((w) => w.id === "rhodes")?.sides.B.stages).toHaveLength(2);
    expect(WONDERS.find((w) => w.id === "giza")?.sides.B.stages).toHaveLength(4);
  });
});
