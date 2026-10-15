import { describe, expect, it } from "vitest";
import { BGA_CARD_NAMES } from "./bga/adapter";
import realCapture from "./bga/fixtures/real-capture.json";
import { CARDS, GUILDS } from "./cards";
import type { CardDef, ResourceType } from "./types";
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

/**
 * The cards and boards are the 2020 second edition. BGA plays the same
 * edition and ships its whole dictionary in `gamedatas`, so the captured
 * table pins every cost, chain, copy count and wonder stage to it.
 */
describe("matches the second edition (BGA's dictionary)", () => {
  const RES: Record<string, ResourceType> = {
    W: "wood",
    S: "stone",
    C: "clay",
    O: "ore",
    G: "glass",
    L: "loom",
    P: "papyrus",
  };
  const tally = (letters: readonly string[]) => {
    const out: Partial<Record<ResourceType, number>> = {};
    for (const l of letters) out[RES[l]] = (out[RES[l]] ?? 0) + 1;
    return out;
  };
  const gamedatas = realCapture.find((e) => e.kind === "gamedatas")?.payload as unknown as {
    card_types: Record<
      string,
      {
        name: string;
        age: number;
        cost: string[];
        coincost: number;
        qt: Record<string, number>;
        freeif: number[];
        points?: { type: string; qt: number };
        shield?: number;
      }
    >;
    wonders: Record<
      string,
      { name: string; side: "A" | "B"; ress: string[]; stages: Record<string, { cost: string[] }> }
    >;
  };
  const bga = Object.values(gamedatas.card_types);
  const name = (n: string) => BGA_CARD_NAMES[n] ?? n;
  const all = [...CARDS, ...GUILDS];

  it("has exactly BGA's cards", () => {
    const ours = all.map((c) => `${c.name}@${c.age}`).sort();
    const theirs = bga.map((c) => `${name(c.name)}@${c.age}`).sort();
    expect(ours).toEqual(theirs);
  });

  it.each(bga.map((c) => [`${name(c.name)} (age ${c.age})`, c] as const))("%s", (_, c) => {
    const def = all.find((d) => d.name === name(c.name) && d.age === c.age);
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.cost.resources ?? {}).toEqual(tally(c.cost));
    expect(def.cost.coins ?? 0).toBe(c.coincost);
    const copies: number[] = [];
    for (let n = 3, prev = 0; n <= 7; prev = c.qt[String(n)], n++) {
      for (let k = prev; k < c.qt[String(n)]; k++) copies.push(n);
    }
    if (def.color !== "purple") expect(def.copies).toEqual(copies);
    const chain = c.freeif.map((id) => name(gamedatas.card_types[String(id)].name)).sort();
    expect([...(def.chainFrom ?? [])].sort()).toEqual(chain);
    if (c.points?.type === "simple") {
      expect(def.effects).toContainEqual({ kind: "points", amount: c.points.qt });
    }
    if (c.shield) expect(def.effects).toContainEqual({ kind: "shields", amount: c.shield });
  });

  it("has BGA's wonder boards", () => {
    let matched = 0;
    for (const w of Object.values(gamedatas.wonders)) {
      const ours =
        WONDERS.find((d) => d.name.replace("Ephesos", "Ephesus") === w.name) ??
        WONDERS.find((d) => w.name.startsWith(d.name.replace("Halikarnassos", "Halicarnassus")));
      if (!ours) continue; // Ur and Carthage: the Edifice wonders we don't play
      matched++;
      const side = ours.sides[w.side];
      expect(side.initialResource).toBe(RES[w.ress[0]]);
      expect(side.stages.map((s) => s.cost.resources)).toEqual(
        Object.values(w.stages).map((s) => tally(s.cost)),
      );
    }
    expect(matched).toBe(WONDERS.length * 2);
  });
});
