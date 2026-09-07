// ---------------------------------------------------------------------------
// The four Map cards laid out as one graph. Everything here is 0-based; the
// rulebook's 1–10 numbering is `regionLabel()` in types.ts.
// ---------------------------------------------------------------------------

import type { Clan } from "./types";

export interface RegionDef {
  id: number;
  /** VP value of each square, TOP-DOWN (highest first). Cubes fill from the top. */
  squares: readonly number[];
  adjacent: readonly number[];
}

/** Rulebook edges: 1-2 2-3 3-4 3-5 4-5 5-6 6-7 6-8 7-9 8-10 9-10 (1-based). */
export const EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [2, 4],
  [3, 4],
  [4, 5],
  [5, 6],
  [5, 7],
  [6, 8],
  [7, 9],
  [8, 9],
];

const SQUARES: readonly (readonly number[])[] = [
  [3, 2, 1], // 1
  [2, 1], // 2
  [2, 1], // 3
  [3], // 4
  [3, 2, 1], // 5
  [2, 1], // 6
  [3, 2, 1], // 7
  [1], // 8
  [3, 2, 1], // 9
  [3, 2, 1], // 10
];

function adjacencyOf(region: number): number[] {
  const out: number[] = [];
  for (const [a, b] of EDGES) {
    if (a === region) out.push(b);
    else if (b === region) out.push(a);
  }
  return out.sort((x, y) => x - y);
}

export const REGIONS: readonly RegionDef[] = SQUARES.map((squares, id) => ({
  id,
  squares,
  adjacent: adjacencyOf(id),
}));

export const REGION_COUNT = REGIONS.length;
export const SQUARE_COUNT = REGIONS.reduce((sum, r) => sum + r.squares.length, 0);

export function areAdjacent(a: number, b: number): boolean {
  return REGIONS[a].adjacent.includes(b);
}

/** Game Setup card: (region, square) → clan, expressed 0-based. */
export const SETUP_CUBES: readonly { region: number; square: number; clan: Clan }[] = [
  { region: 0, square: 0, clan: "mori" }, // 1/3
  { region: 1, square: 0, clan: "mori" }, // 2/2
  { region: 2, square: 0, clan: "mori" }, // 3/2
  { region: 4, square: 0, clan: "oda" }, // 5/3
  { region: 5, square: 0, clan: "oda" }, // 6/2
  { region: 5, square: 1, clan: "oda" }, // 6/1
  { region: 6, square: 0, clan: "takeda" }, // 7/3
  { region: 6, square: 1, clan: "takeda" }, // 7/2
  { region: 6, square: 2, clan: "oda" }, // 7/1
  { region: 8, square: 0, clan: "uesugi" }, // 9/3
  { region: 8, square: 1, clan: "takeda" }, // 9/2
  { region: 8, square: 2, clan: "uesugi" }, // 9/1
  { region: 9, square: 0, clan: "uesugi" }, // 10/3
];

export const CUBES_PER_CLAN = 8;

/** Regions 04 and 08 (single-square): the Emperor scores 0 there if any cube is present. */
export const EMPEROR_ZERO_REGIONS: ReadonlySet<number> = new Set([3, 7]);

/** Cards dealt to each player per round (index = round − 1). */
export const CARDS_PER_ROUND = {
  standard: [6, 7, 8, 9, 10, 11, 12, 13],
  fivePlayer: [6, 7, 8, 9, 10, 10, 10, 10],
} as const;

export function cardsPerRound(playerCount: number, round: number): number {
  const table = playerCount === 5 ? CARDS_PER_ROUND.fivePlayer : CARDS_PER_ROUND.standard;
  const n = table[round - 1];
  if (n === undefined) throw new Error(`No deal size for round ${round}`);
  return n;
}
