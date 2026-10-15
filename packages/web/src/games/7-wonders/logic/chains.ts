import { CARDS } from "@boardgames/core/games/7-wonders/cards";
import type { Age, CardColor, CardDef } from "@boardgames/core/games/7-wonders/types";
import { TABLEAU_ORDER } from "../card-utils";

/** One card in the chain map, placed in its Age's column. */
export interface ChainNode {
  name: string;
  age: Age;
  color: CardColor;
  def: CardDef;
  /** Row within its component (0-based), already centred against the other columns. */
  row: number;
}

/** A free build: owning `from` lets you build `to` without paying. */
export interface ChainEdge {
  from: string;
  to: string;
}

/** A family of cards linked by chains, laid out Age I → II → III. */
export interface ChainGroup {
  nodes: ChainNode[];
  edges: ChainEdge[];
  /** Rows the tallest Age column needs. */
  rows: number;
}

/** How many copies of a card a game of `players` deals (its printed "3+", "5+"…). */
export function copiesAt(def: CardDef, players: number): number {
  return def.copies.filter((c) => c <= players).length;
}

/**
 * Every chain in the game as connected families, each laid out in three Age
 * columns with rows ordered so a link runs as straight as it can: a card
 * sits level with the average of the cards it chains from.
 */
export function chainGroups(cards: readonly CardDef[] = CARDS): ChainGroup[] {
  // Names are unique among chained cards (the duplicated Age I/II goods never chain).
  const byName = new Map<string, CardDef>();
  for (const c of cards) if (!byName.has(c.name)) byName.set(c.name, c);
  const edges: ChainEdge[] = cards.flatMap((c) =>
    (c.chainFrom ?? []).filter((f) => byName.has(f)).map((from) => ({ from, to: c.name })),
  );

  // Union-find over the linked names.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const { from, to } of edges) {
    const a = find(from);
    const b = find(to);
    if (a !== b) parent.set(a, b);
  }
  const members = new Map<string, string[]>();
  for (const { from, to } of edges) {
    for (const n of [from, to]) {
      const root = find(n);
      const list = members.get(root) ?? [];
      if (!list.includes(n)) list.push(n);
      members.set(root, list);
    }
  }

  const order = (n: string) => {
    const d = byName.get(n);
    return d ? TABLEAU_ORDER.indexOf(d.color) * 100 + cards.indexOf(d) / 1000 : 0;
  };

  const groups = [...members.values()].map((names): ChainGroup => {
    const groupEdges = edges.filter((e) => names.includes(e.from));
    const rowOf = new Map<string, number>();
    const columns: string[][] = [1, 2, 3].map((age) =>
      names.filter((n) => byName.get(n)?.age === age),
    );
    // Age I by colour; later Ages level with what they chain from (or into).
    columns[0].sort((a, b) => order(a) - order(b));
    for (const [i, n] of columns[0].entries()) rowOf.set(n, i);
    for (const col of [1, 2]) {
      const anchor = (n: string) => {
        const from = groupEdges.filter((e) => e.to === n).map((e) => rowOf.get(e.from));
        const known = from.filter((r): r is number => r !== undefined);
        return known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : order(n);
      };
      columns[col].sort((a, b) => anchor(a) - anchor(b) || order(a) - order(b));
      for (const [i, n] of columns[col].entries()) rowOf.set(n, i);
    }
    const rows = Math.max(...columns.map((c) => c.length));
    const nodes: ChainNode[] = columns.flatMap((col) => {
      const offset = (rows - col.length) / 2;
      return col.flatMap((name) => {
        const def = byName.get(name);
        if (!def) return [];
        return [
          { name, age: def.age, color: def.color, def, row: (rowOf.get(name) ?? 0) + offset },
        ];
      });
    });
    return { nodes, edges: groupEdges, rows };
  });

  // Families by the colour of their first card, then by size.
  const key = (g: ChainGroup) =>
    Math.min(...g.nodes.map((n) => TABLEAU_ORDER.indexOf(n.color))) * 100 - g.nodes.length;
  return groups.sort((a, b) => key(a) - key(b));
}

/** Split families into `cols` columns of about equal height (tallest first, greedy). */
export function balance<T>(items: readonly T[], height: (t: T) => number, cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => []);
  const sums = new Array<number>(cols).fill(0);
  for (const item of items) {
    const i = sums.indexOf(Math.min(...sums));
    out[i].push(item);
    sums[i] += height(item);
  }
  return out;
}

/** Chain families of one colour: those that start from a card of that colour. */
export interface ChainSection {
  color: CardColor;
  groups: ChainGroup[];
}

/**
 * Families sorted into sections by the colour of the card each one starts
 * from (its earliest card) — Civilian, Commercial, Military, Science… — in
 * the order a city lays its colours out.
 */
export function chainSections(groups: readonly ChainGroup[]): ChainSection[] {
  const rootColor = (g: ChainGroup): CardColor => {
    const first = Math.min(...g.nodes.map((n) => n.age));
    const roots = g.nodes.filter((n) => n.age === first);
    return roots.sort((a, b) => TABLEAU_ORDER.indexOf(a.color) - TABLEAU_ORDER.indexOf(b.color))[0]
      .color;
  };
  const by = new Map<CardColor, ChainGroup[]>();
  for (const g of groups) {
    const c = rootColor(g);
    by.set(c, [...(by.get(c) ?? []), g]);
  }
  return TABLEAU_ORDER.filter((c) => by.has(c)).map((color) => ({
    color,
    groups: (by.get(color) ?? []).sort((a, b) => b.rows - a.rows),
  }));
}
