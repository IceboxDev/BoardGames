import type { CardDef } from "./types";

/**
 * Full base-game card list (2010 edition). `copies` lists the player counts at
 * which one more physical copy enters the deck (the printed "3+", "4+" corner
 * values), so the deck for N players contains every entry once per copies
 * value <= N. `data.test.ts` asserts each age totals 7 cards per player.
 */

// ── Age I ───────────────────────────────────────────────────────────────────

const AGE_1: readonly CardDef[] = [
  // Brown — raw materials
  {
    name: "Lumber Yard",
    age: 1,
    color: "brown",
    cost: {},
    effects: [{ kind: "production", resources: ["wood"] }],
    copies: [3, 4],
  },
  {
    name: "Stone Pit",
    age: 1,
    color: "brown",
    cost: {},
    effects: [{ kind: "production", resources: ["stone"] }],
    copies: [3, 5],
  },
  {
    name: "Clay Pool",
    age: 1,
    color: "brown",
    cost: {},
    effects: [{ kind: "production", resources: ["clay"] }],
    copies: [3, 5],
  },
  {
    name: "Ore Vein",
    age: 1,
    color: "brown",
    cost: {},
    effects: [{ kind: "production", resources: ["ore"] }],
    copies: [3, 4],
  },
  {
    name: "Tree Farm",
    age: 1,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["wood", "clay"] }],
    copies: [6],
  },
  {
    name: "Excavation",
    age: 1,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["stone", "clay"] }],
    copies: [4],
  },
  {
    name: "Clay Pit",
    age: 1,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["clay", "ore"] }],
    copies: [3],
  },
  {
    name: "Timber Yard",
    age: 1,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["stone", "wood"] }],
    copies: [3],
  },
  {
    name: "Forest Cave",
    age: 1,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["wood", "ore"] }],
    copies: [5],
  },
  {
    name: "Mine",
    age: 1,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["ore", "stone"] }],
    copies: [6],
  },
  // Grey — manufactured goods
  {
    name: "Loom",
    age: 1,
    color: "grey",
    cost: {},
    effects: [{ kind: "production", resources: ["loom"] }],
    copies: [3, 6],
  },
  {
    name: "Glassworks",
    age: 1,
    color: "grey",
    cost: {},
    effects: [{ kind: "production", resources: ["glass"] }],
    copies: [3, 6],
  },
  {
    name: "Press",
    age: 1,
    color: "grey",
    cost: {},
    effects: [{ kind: "production", resources: ["papyrus"] }],
    copies: [3, 6],
  },
  // Blue — civilian
  {
    name: "Pawnshop",
    age: 1,
    color: "blue",
    cost: {},
    effects: [{ kind: "points", amount: 3 }],
    copies: [4, 7],
  },
  {
    name: "Baths",
    age: 1,
    color: "blue",
    cost: { resources: { stone: 1 } },
    effects: [{ kind: "points", amount: 3 }],
    copies: [3, 7],
  },
  {
    name: "Altar",
    age: 1,
    color: "blue",
    cost: {},
    effects: [{ kind: "points", amount: 2 }],
    copies: [3, 5],
  },
  {
    name: "Theater",
    age: 1,
    color: "blue",
    cost: {},
    effects: [{ kind: "points", amount: 2 }],
    copies: [3, 6],
  },
  // Yellow — commercial
  {
    name: "Tavern",
    age: 1,
    color: "yellow",
    cost: {},
    effects: [{ kind: "coins", amount: 5 }],
    copies: [4, 5, 7],
  },
  {
    name: "East Trading Post",
    age: 1,
    color: "yellow",
    cost: {},
    effects: [{ kind: "trade-discount", resources: "raw", neighbors: ["right"] }],
    copies: [3, 7],
  },
  {
    name: "West Trading Post",
    age: 1,
    color: "yellow",
    cost: {},
    effects: [{ kind: "trade-discount", resources: "raw", neighbors: ["left"] }],
    copies: [3, 7],
  },
  {
    name: "Marketplace",
    age: 1,
    color: "yellow",
    cost: {},
    effects: [{ kind: "trade-discount", resources: "manufactured", neighbors: ["left", "right"] }],
    copies: [3, 6],
  },
  // Red — military
  {
    name: "Stockade",
    age: 1,
    color: "red",
    cost: { resources: { wood: 1 } },
    effects: [{ kind: "shields", amount: 1 }],
    copies: [3, 7],
  },
  {
    name: "Barracks",
    age: 1,
    color: "red",
    cost: { resources: { ore: 1 } },
    effects: [{ kind: "shields", amount: 1 }],
    copies: [3, 5],
  },
  {
    name: "Guard Tower",
    age: 1,
    color: "red",
    cost: { resources: { clay: 1 } },
    effects: [{ kind: "shields", amount: 1 }],
    copies: [3, 4],
  },
  // Green — science
  {
    name: "Apothecary",
    age: 1,
    color: "green",
    cost: { resources: { loom: 1 } },
    effects: [{ kind: "science", symbol: "compass" }],
    copies: [3, 5],
  },
  {
    name: "Workshop",
    age: 1,
    color: "green",
    cost: { resources: { glass: 1 } },
    effects: [{ kind: "science", symbol: "gear" }],
    copies: [3, 7],
  },
  {
    name: "Scriptorium",
    age: 1,
    color: "green",
    cost: { resources: { papyrus: 1 } },
    effects: [{ kind: "science", symbol: "tablet" }],
    copies: [3, 4],
  },
];

// ── Age II ──────────────────────────────────────────────────────────────────

const AGE_2: readonly CardDef[] = [
  // Brown
  {
    name: "Sawmill",
    age: 2,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["wood"], count: 2 }],
    copies: [3, 4],
  },
  {
    name: "Quarry",
    age: 2,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["stone"], count: 2 }],
    copies: [3, 4],
  },
  {
    name: "Brickyard",
    age: 2,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["clay"], count: 2 }],
    copies: [3, 4],
  },
  {
    name: "Foundry",
    age: 2,
    color: "brown",
    cost: { coins: 1 },
    effects: [{ kind: "production", resources: ["ore"], count: 2 }],
    copies: [3, 4],
  },
  // Grey
  {
    name: "Loom",
    age: 2,
    color: "grey",
    cost: {},
    effects: [{ kind: "production", resources: ["loom"] }],
    copies: [3, 5],
  },
  {
    name: "Glassworks",
    age: 2,
    color: "grey",
    cost: {},
    effects: [{ kind: "production", resources: ["glass"] }],
    copies: [3, 5],
  },
  {
    name: "Press",
    age: 2,
    color: "grey",
    cost: {},
    effects: [{ kind: "production", resources: ["papyrus"] }],
    copies: [3, 5],
  },
  // Blue
  {
    name: "Aqueduct",
    age: 2,
    color: "blue",
    cost: { resources: { stone: 3 } },
    effects: [{ kind: "points", amount: 5 }],
    chainFrom: ["Baths"],
    copies: [3, 7],
  },
  {
    name: "Temple",
    age: 2,
    color: "blue",
    cost: { resources: { wood: 1, clay: 1, glass: 1 } },
    effects: [{ kind: "points", amount: 3 }],
    chainFrom: ["Altar"],
    copies: [3, 6],
  },
  {
    name: "Statue",
    age: 2,
    color: "blue",
    cost: { resources: { wood: 1, ore: 2 } },
    effects: [{ kind: "points", amount: 4 }],
    chainFrom: ["Theater"],
    copies: [3, 7],
  },
  {
    name: "Courthouse",
    age: 2,
    color: "blue",
    cost: { resources: { clay: 2, loom: 1 } },
    effects: [{ kind: "points", amount: 4 }],
    chainFrom: ["Scriptorium"],
    copies: [3, 5],
  },
  // Yellow
  {
    name: "Forum",
    age: 2,
    color: "yellow",
    cost: { resources: { clay: 2 } },
    effects: [{ kind: "production", resources: ["glass", "loom", "papyrus"] }],
    chainFrom: ["East Trading Post", "West Trading Post"],
    copies: [3, 6, 7],
  },
  {
    name: "Caravansery",
    age: 2,
    color: "yellow",
    cost: { resources: { wood: 2 } },
    effects: [{ kind: "production", resources: ["wood", "stone", "clay", "ore"] }],
    chainFrom: ["Marketplace"],
    copies: [3, 5, 6],
  },
  {
    name: "Vineyard",
    age: 2,
    color: "yellow",
    cost: {},
    effects: [
      { kind: "coins-per-card", color: "brown", scopes: ["self", "left", "right"], amount: 1 },
    ],
    copies: [3, 6],
  },
  {
    name: "Bazar",
    age: 2,
    color: "yellow",
    cost: {},
    effects: [
      { kind: "coins-per-card", color: "grey", scopes: ["self", "left", "right"], amount: 2 },
    ],
    copies: [4, 7],
  },
  // Red
  {
    name: "Walls",
    age: 2,
    color: "red",
    cost: { resources: { stone: 3 } },
    effects: [{ kind: "shields", amount: 2 }],
    copies: [3, 7],
  },
  {
    name: "Training Ground",
    age: 2,
    color: "red",
    cost: { resources: { wood: 1, ore: 2 } },
    effects: [{ kind: "shields", amount: 2 }],
    copies: [4, 6, 7],
  },
  {
    name: "Stables",
    age: 2,
    color: "red",
    cost: { resources: { ore: 1, clay: 1, wood: 1 } },
    effects: [{ kind: "shields", amount: 2 }],
    chainFrom: ["Apothecary"],
    copies: [3, 5],
  },
  {
    name: "Archery Range",
    age: 2,
    color: "red",
    cost: { resources: { wood: 2, ore: 1 } },
    effects: [{ kind: "shields", amount: 2 }],
    chainFrom: ["Workshop"],
    copies: [3, 6],
  },
  // Green
  {
    name: "Dispensary",
    age: 2,
    color: "green",
    cost: { resources: { ore: 2, glass: 1 } },
    effects: [{ kind: "science", symbol: "compass" }],
    chainFrom: ["Apothecary"],
    copies: [3, 4],
  },
  {
    name: "Laboratory",
    age: 2,
    color: "green",
    cost: { resources: { clay: 2, papyrus: 1 } },
    effects: [{ kind: "science", symbol: "gear" }],
    chainFrom: ["Workshop"],
    copies: [3, 5],
  },
  {
    name: "Library",
    age: 2,
    color: "green",
    cost: { resources: { stone: 2, loom: 1 } },
    effects: [{ kind: "science", symbol: "tablet" }],
    chainFrom: ["Scriptorium"],
    copies: [3, 6],
  },
  {
    name: "School",
    age: 2,
    color: "green",
    cost: { resources: { wood: 1, papyrus: 1 } },
    effects: [{ kind: "science", symbol: "tablet" }],
    copies: [3, 7],
  },
];

// ── Age III (non-guild) ─────────────────────────────────────────────────────

const AGE_3: readonly CardDef[] = [
  // Blue
  {
    name: "Pantheon",
    age: 3,
    color: "blue",
    cost: { resources: { clay: 2, ore: 1, glass: 1, papyrus: 1, loom: 1 } },
    effects: [{ kind: "points", amount: 7 }],
    chainFrom: ["Temple"],
    copies: [3, 6],
  },
  {
    name: "Gardens",
    age: 3,
    color: "blue",
    cost: { resources: { clay: 2, wood: 1 } },
    effects: [{ kind: "points", amount: 5 }],
    chainFrom: ["Statue"],
    copies: [3, 4],
  },
  {
    name: "Town Hall",
    age: 3,
    color: "blue",
    cost: { resources: { stone: 2, ore: 1, glass: 1 } },
    effects: [{ kind: "points", amount: 6 }],
    copies: [3, 5, 6],
  },
  {
    name: "Palace",
    age: 3,
    color: "blue",
    cost: {
      resources: { wood: 1, stone: 1, clay: 1, ore: 1, glass: 1, loom: 1, papyrus: 1 },
    },
    effects: [{ kind: "points", amount: 8 }],
    copies: [3, 7],
  },
  {
    name: "Senate",
    age: 3,
    color: "blue",
    cost: { resources: { wood: 2, stone: 1, ore: 1 } },
    effects: [{ kind: "points", amount: 6 }],
    chainFrom: ["Library"],
    copies: [3, 5],
  },
  // Yellow
  {
    name: "Haven",
    age: 3,
    color: "yellow",
    cost: { resources: { wood: 1, ore: 1, loom: 1 } },
    effects: [
      { kind: "coins-per-card", color: "brown", scopes: ["self"], amount: 1 },
      { kind: "points-per-card", color: "brown", scopes: ["self"], amount: 1 },
    ],
    chainFrom: ["Forum"],
    copies: [3, 4],
  },
  {
    name: "Lighthouse",
    age: 3,
    color: "yellow",
    cost: { resources: { stone: 1, glass: 1 } },
    effects: [
      { kind: "coins-per-card", color: "yellow", scopes: ["self"], amount: 1 },
      { kind: "points-per-card", color: "yellow", scopes: ["self"], amount: 1 },
    ],
    chainFrom: ["Caravansery"],
    copies: [3, 6],
  },
  {
    name: "Chamber of Commerce",
    age: 3,
    color: "yellow",
    cost: { resources: { clay: 2, papyrus: 1 } },
    effects: [
      { kind: "coins-per-card", color: "grey", scopes: ["self"], amount: 2 },
      { kind: "points-per-card", color: "grey", scopes: ["self"], amount: 2 },
    ],
    copies: [4, 6],
  },
  {
    name: "Arena",
    age: 3,
    color: "yellow",
    cost: { resources: { stone: 2, ore: 1 } },
    effects: [
      { kind: "coins-per-stage", scopes: ["self"], amount: 3 },
      { kind: "points-per-stage", scopes: ["self"], amount: 1 },
    ],
    chainFrom: ["Dispensary"],
    copies: [3, 5, 7],
  },
  // Red
  {
    name: "Fortifications",
    age: 3,
    color: "red",
    cost: { resources: { ore: 3, stone: 1 } },
    effects: [{ kind: "shields", amount: 3 }],
    chainFrom: ["Walls"],
    copies: [3, 7],
  },
  {
    name: "Circus",
    age: 3,
    color: "red",
    cost: { resources: { stone: 3, ore: 1 } },
    effects: [{ kind: "shields", amount: 3 }],
    chainFrom: ["Training Ground"],
    copies: [4, 5, 6],
  },
  {
    name: "Arsenal",
    age: 3,
    color: "red",
    cost: { resources: { wood: 2, ore: 1, loom: 1 } },
    effects: [{ kind: "shields", amount: 3 }],
    copies: [3, 4, 7],
  },
  {
    name: "Siege Workshop",
    age: 3,
    color: "red",
    cost: { resources: { clay: 3, wood: 1 } },
    effects: [{ kind: "shields", amount: 3 }],
    chainFrom: ["Laboratory"],
    copies: [3, 5],
  },
  // Green
  {
    name: "Lodge",
    age: 3,
    color: "green",
    cost: { resources: { clay: 2, loom: 1, papyrus: 1 } },
    effects: [{ kind: "science", symbol: "compass" }],
    chainFrom: ["Dispensary"],
    copies: [3, 6],
  },
  {
    name: "Observatory",
    age: 3,
    color: "green",
    cost: { resources: { ore: 2, glass: 1, loom: 1 } },
    effects: [{ kind: "science", symbol: "gear" }],
    chainFrom: ["Laboratory"],
    copies: [3, 7],
  },
  {
    name: "University",
    age: 3,
    color: "green",
    cost: { resources: { wood: 2, papyrus: 1, glass: 1 } },
    effects: [{ kind: "science", symbol: "tablet" }],
    chainFrom: ["Library"],
    copies: [3, 4],
  },
  {
    name: "Academy",
    age: 3,
    color: "green",
    cost: { resources: { stone: 3, glass: 1 } },
    effects: [{ kind: "science", symbol: "compass" }],
    chainFrom: ["School"],
    copies: [3, 7],
  },
  {
    name: "Study",
    age: 3,
    color: "green",
    cost: { resources: { wood: 1, papyrus: 1, loom: 1 } },
    effects: [{ kind: "science", symbol: "gear" }],
    chainFrom: ["School"],
    copies: [3, 5],
  },
];

// ── Guilds (Age III, purple) ────────────────────────────────────────────────

export const GUILDS: readonly CardDef[] = [
  {
    name: "Workers Guild",
    age: 3,
    color: "purple",
    cost: { resources: { ore: 2, clay: 1, stone: 1, wood: 1 } },
    effects: [{ kind: "points-per-card", color: "brown", scopes: ["left", "right"], amount: 1 }],
    copies: [3],
  },
  {
    name: "Craftsmens Guild",
    age: 3,
    color: "purple",
    cost: { resources: { ore: 2, stone: 2 } },
    effects: [{ kind: "points-per-card", color: "grey", scopes: ["left", "right"], amount: 2 }],
    copies: [3],
  },
  {
    name: "Traders Guild",
    age: 3,
    color: "purple",
    cost: { resources: { glass: 1, loom: 1, papyrus: 1 } },
    effects: [{ kind: "points-per-card", color: "yellow", scopes: ["left", "right"], amount: 1 }],
    copies: [3],
  },
  {
    name: "Philosophers Guild",
    age: 3,
    color: "purple",
    cost: { resources: { clay: 3, loom: 1, papyrus: 1 } },
    effects: [{ kind: "points-per-card", color: "green", scopes: ["left", "right"], amount: 1 }],
    copies: [3],
  },
  {
    name: "Spies Guild",
    age: 3,
    color: "purple",
    cost: { resources: { clay: 3, glass: 1 } },
    effects: [{ kind: "points-per-card", color: "red", scopes: ["left", "right"], amount: 1 }],
    copies: [3],
  },
  {
    name: "Strategists Guild",
    age: 3,
    color: "purple",
    cost: { resources: { ore: 2, stone: 1, loom: 1 } },
    effects: [{ kind: "points-per-defeat", scopes: ["left", "right"], amount: 1 }],
    copies: [3],
  },
  {
    name: "Shipowners Guild",
    age: 3,
    color: "purple",
    cost: { resources: { wood: 3, glass: 1, papyrus: 1 } },
    effects: [
      { kind: "points-per-card", color: "brown", scopes: ["self"], amount: 1 },
      { kind: "points-per-card", color: "grey", scopes: ["self"], amount: 1 },
      { kind: "points-per-card", color: "purple", scopes: ["self"], amount: 1 },
    ],
    copies: [3],
  },
  {
    name: "Scientists Guild",
    age: 3,
    color: "purple",
    cost: { resources: { wood: 2, ore: 2, papyrus: 1 } },
    effects: [{ kind: "science-wildcard" }],
    copies: [3],
  },
  {
    name: "Magistrates Guild",
    age: 3,
    color: "purple",
    cost: { resources: { wood: 3, stone: 1, loom: 1 } },
    effects: [{ kind: "points-per-card", color: "blue", scopes: ["left", "right"], amount: 1 }],
    copies: [3],
  },
  {
    name: "Builders Guild",
    age: 3,
    color: "purple",
    cost: { resources: { stone: 2, clay: 2, glass: 1 } },
    effects: [{ kind: "points-per-stage", scopes: ["self", "left", "right"], amount: 1 }],
    copies: [3],
  },
];

export const CARDS: readonly CardDef[] = [...AGE_1, ...AGE_2, ...AGE_3];

/**
 * Lookup by (name, age) key — "Loom"/"Glassworks"/"Press" exist in both age 1
 * and age 2 with identical effects, so a plain name lookup is also provided
 * (returns the first match) for rules that don't care about the age.
 */
export const CARD_BY_NAME: ReadonlyMap<string, CardDef> = new Map(
  [...CARDS, ...GUILDS].map((c) => [c.name, c]),
);

export function getCardDef(name: string): CardDef {
  const def = CARD_BY_NAME.get(name);
  if (!def) throw new Error(`Unknown card: ${name}`);
  return def;
}
