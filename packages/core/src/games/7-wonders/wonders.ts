import type { WonderDef } from "./types";

/** All 7 base-game wonder boards (2020 second edition), Day (A) and Night (B) sides. */
export const WONDERS: readonly WonderDef[] = [
  {
    id: "giza",
    name: "The Pyramids of Giza",
    sides: {
      A: {
        initialResource: "stone",
        stages: [
          { cost: { resources: { wood: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          { cost: { resources: { clay: 2, loom: 1 } }, effects: [{ kind: "points", amount: 5 }] },
          { cost: { resources: { stone: 4 } }, effects: [{ kind: "points", amount: 7 }] },
        ],
      },
      B: {
        initialResource: "stone",
        stages: [
          { cost: { resources: { wood: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          { cost: { resources: { stone: 3 } }, effects: [{ kind: "points", amount: 5 }] },
          { cost: { resources: { clay: 3 } }, effects: [{ kind: "points", amount: 5 }] },
          {
            cost: { resources: { stone: 4, papyrus: 1 } },
            effects: [{ kind: "points", amount: 7 }],
          },
        ],
      },
    },
  },
  {
    id: "babylon",
    name: "The Hanging Gardens of Babylon",
    sides: {
      A: {
        initialResource: "wood",
        stages: [
          { cost: { resources: { clay: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          { cost: { resources: { ore: 2, loom: 1 } }, effects: [{ kind: "science-wildcard" }] },
          { cost: { resources: { wood: 4 } }, effects: [{ kind: "points", amount: 7 }] },
        ],
      },
      B: {
        initialResource: "wood",
        stages: [
          { cost: { resources: { stone: 2 } }, effects: [{ kind: "play-seventh-card" }] },
          { cost: { resources: { clay: 3, glass: 1 } }, effects: [{ kind: "science-wildcard" }] },
        ],
      },
    },
  },
  {
    id: "olympia",
    name: "The Statue of Zeus in Olympia",
    sides: {
      A: {
        initialResource: "clay",
        stages: [
          { cost: { resources: { stone: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          { cost: { resources: { wood: 2 } }, effects: [{ kind: "free-first-of-color" }] },
          { cost: { resources: { clay: 3 } }, effects: [{ kind: "points", amount: 7 }] },
        ],
      },
      B: {
        initialResource: "clay",
        stages: [
          {
            cost: { resources: { ore: 2 } },
            effects: [{ kind: "points", amount: 2 }, { kind: "free-first-of-age" }],
          },
          {
            cost: { resources: { clay: 3 } },
            effects: [{ kind: "points", amount: 3 }, { kind: "free-last-of-age" }],
          },
          {
            cost: { resources: { glass: 1, loom: 1, papyrus: 1 } },
            effects: [{ kind: "points", amount: 5 }],
          },
        ],
      },
    },
  },
  {
    id: "rhodes",
    name: "The Colossus of Rhodes",
    sides: {
      A: {
        initialResource: "ore",
        stages: [
          { cost: { resources: { wood: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          { cost: { resources: { clay: 3 } }, effects: [{ kind: "shields", amount: 2 }] },
          { cost: { resources: { ore: 4 } }, effects: [{ kind: "points", amount: 7 }] },
        ],
      },
      B: {
        initialResource: "ore",
        stages: [
          {
            cost: { resources: { stone: 3 } },
            effects: [
              { kind: "shields", amount: 1 },
              { kind: "points", amount: 3 },
              { kind: "coins", amount: 3 },
            ],
          },
          {
            cost: { resources: { ore: 4 } },
            effects: [
              { kind: "shields", amount: 1 },
              { kind: "points", amount: 4 },
              { kind: "coins", amount: 4 },
            ],
          },
        ],
      },
    },
  },
  {
    id: "ephesos",
    name: "The Temple of Artemis in Ephesos",
    sides: {
      A: {
        initialResource: "papyrus",
        stages: [
          { cost: { resources: { clay: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          { cost: { resources: { wood: 2 } }, effects: [{ kind: "coins", amount: 9 }] },
          { cost: { resources: { ore: 2, glass: 1 } }, effects: [{ kind: "points", amount: 7 }] },
        ],
      },
      B: {
        initialResource: "papyrus",
        stages: [
          {
            cost: { resources: { stone: 2 } },
            effects: [
              { kind: "points", amount: 2 },
              { kind: "coins", amount: 4 },
            ],
          },
          {
            cost: { resources: { wood: 2 } },
            effects: [
              { kind: "points", amount: 3 },
              { kind: "coins", amount: 4 },
            ],
          },
          {
            cost: { resources: { ore: 2, loom: 1 } },
            effects: [
              { kind: "points", amount: 5 },
              { kind: "coins", amount: 4 },
            ],
          },
        ],
      },
    },
  },
  {
    id: "alexandria",
    name: "The Lighthouse of Alexandria",
    sides: {
      A: {
        initialResource: "glass",
        stages: [
          { cost: { resources: { stone: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          {
            cost: { resources: { ore: 2 } },
            effects: [{ kind: "production", resources: ["wood", "stone", "clay", "ore"] }],
          },
          {
            cost: { resources: { loom: 1, papyrus: 1 } },
            effects: [{ kind: "points", amount: 7 }],
          },
        ],
      },
      B: {
        initialResource: "glass",
        stages: [
          {
            cost: { resources: { clay: 2 } },
            effects: [{ kind: "production", resources: ["wood", "stone", "clay", "ore"] }],
          },
          {
            cost: { resources: { ore: 3 } },
            effects: [{ kind: "production", resources: ["glass", "loom", "papyrus"] }],
          },
          { cost: { resources: { wood: 4 } }, effects: [{ kind: "points", amount: 7 }] },
        ],
      },
    },
  },
  {
    id: "halikarnassos",
    name: "The Mausoleum of Halikarnassos",
    sides: {
      A: {
        initialResource: "loom",
        stages: [
          { cost: { resources: { ore: 2 } }, effects: [{ kind: "points", amount: 3 }] },
          { cost: { resources: { glass: 1, papyrus: 1 } }, effects: [{ kind: "play-discarded" }] },
          { cost: { resources: { stone: 3 } }, effects: [{ kind: "points", amount: 7 }] },
        ],
      },
      B: {
        initialResource: "loom",
        stages: [
          {
            cost: { resources: { clay: 2 } },
            effects: [{ kind: "points", amount: 2 }, { kind: "play-discarded" }],
          },
          {
            cost: { resources: { glass: 1, papyrus: 1 } },
            effects: [{ kind: "points", amount: 1 }, { kind: "play-discarded" }],
          },
          { cost: { resources: { wood: 3 } }, effects: [{ kind: "play-discarded" }] },
        ],
      },
    },
  },
];

export const WONDER_BY_ID: ReadonlyMap<string, WonderDef> = new Map(WONDERS.map((w) => [w.id, w]));

export function getWonderDef(id: string): WonderDef {
  const def = WONDER_BY_ID.get(id);
  if (!def) throw new Error(`Unknown wonder: ${id}`);
  return def;
}
