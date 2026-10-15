import { CARDS } from "@boardgames/core/games/7-wonders/cards";
import { describe, expect, it } from "vitest";
import { balance, chainGroups, chainSections, copiesAt } from "./chains";

describe("chain map", () => {
  const groups = chainGroups();

  it("holds every chain in the game exactly once", () => {
    const links = CARDS.flatMap((c) => (c.chainFrom ?? []).map((f) => `${f}>${c.name}`));
    const shown = groups.flatMap((g) => g.edges.map((e) => `${e.from}>${e.to}`));
    expect(shown.sort()).toEqual([...new Set(links)].sort());
  });

  it("puts each card in its Age's column, and every link runs forward in time", () => {
    for (const g of groups) {
      const age = new Map(g.nodes.map((n) => [n.name, n.age]));
      for (const e of g.edges) expect(age.get(e.from)).toBeLessThan(age.get(e.to) ?? 0);
      for (const n of g.nodes) expect(n.row).toBeLessThanOrEqual(g.rows - 1);
    }
  });

  it("never stacks two cards on one spot", () => {
    for (const g of groups) {
      const spots = g.nodes.map((n) => `${n.age}:${n.row}`);
      expect(new Set(spots).size).toBe(spots.length);
    }
  });

  it("counts copies by player count", () => {
    const def = CARDS.find((c) => c.copies.length > 1);
    if (!def) throw new Error("no multi-copy card");
    expect(copiesAt(def, 7)).toBe(def.copies.length);
    expect(copiesAt(def, 2)).toBe(0);
  });

  it("balances families into columns", () => {
    const cols = balance([5, 4, 3, 2, 1], (n) => n, 2);
    expect(cols.map((c) => c.reduce((a, b) => a + b, 0))).toEqual([8, 7]);
  });

  it("sorts every family into a section by the colour it starts from", () => {
    const sections = chainSections(groups);
    expect(sections.flatMap((s) => s.groups)).toHaveLength(groups.length);
    for (const s of sections) {
      for (const g of s.groups) {
        const first = Math.min(...g.nodes.map((n) => n.age));
        expect(g.nodes.some((n) => n.age === first && n.color === s.color)).toBe(true);
      }
    }
    // Scriptorium's family is Science; Baths' is Civilian.
    const of = (name: string) =>
      sections.find((s) => s.groups.some((g) => g.nodes.some((n) => n.name === name)))?.color;
    expect(of("Scriptorium")).toBe("green");
    expect(of("Baths")).toBe("blue");
  });
});
