// ---------------------------------------------------------------------------
// The fixed test layout: the Castle on the west, the Labyrinth on the east,
// three paths (Road / Railroad / Boat) through Mountains → Plains → Forest,
// crossing at a few intersections. Every space kind appears at least once.
// The rules tests are written against it (road-4, rail-2, …), so it never
// changes when the real boards are remapped in the editor. It also seeded the
// provisional board files before the real sides were mapped.
// ---------------------------------------------------------------------------

import type { BoardDef, PathKind, Region, SpaceDef, SpaceEffect } from "../types";

const LANE_LEN = 11;
const LANE_Y: Record<PathKind, number> = { road: 220, rail: 470, boat: 720 };
const X0 = 330;
const DX = 105;

function regionOf(i: number): Region {
  if (i <= 2) return "mountains";
  if (i <= 6) return "plains";
  return "forest";
}

const LANE_EFFECTS: Record<PathKind, readonly SpaceEffect[]> = {
  road: [
    "chest",
    "well",
    "crypt",
    "market",
    "chest",
    "crypt",
    "well",
    "church",
    "chest-open",
    "none",
    "well",
  ],
  rail: [
    "none",
    "mansion",
    "chest",
    "well",
    "tavern",
    "chest",
    "barracks",
    "well",
    "chest",
    "crypt",
    "chest-open",
  ],
  boat: [
    "ship",
    "chest",
    "well",
    "barracks",
    "ship",
    "chest-open",
    "church",
    "ship",
    "well",
    "mansion",
    "chest",
  ],
};

/** Rookie side: VP lost at sunrise, printed on each Mountain space. */
const MOUNTAIN_PENALTY = [2, 4, 6];

function lane(path: PathKind, rookie: boolean): SpaceDef[] {
  return LANE_EFFECTS[path].map((effect, i) => ({
    id: `${path}-${i}`,
    region: regionOf(i),
    path,
    effect,
    mountainPenalty: rookie && i <= 2 ? MOUNTAIN_PENALTY[i] : undefined,
    x: X0 + i * DX,
    // Gentle weave so the lanes read as paths, not a spreadsheet.
    y: LANE_Y[path] + (i % 2 === 0 ? 0 : 22),
  }));
}

/** `rookie` adds the Mountains' printed sunrise penalties (side A style). */
export function buildTestBoard(side: BoardDef["side"] = "test", rookie = true): BoardDef {
  const spaces: SpaceDef[] = [
    { id: "castle", region: "castle", path: null, effect: "castle", x: 110, y: 470 },
    { id: "cemetery", region: "cemetery", path: null, effect: "cemetery", x: 200, y: 880 },
    { id: "labyrinth", region: "forest", path: null, effect: "labyrinth", x: 1540, y: 470 },
    ...lane("road", rookie),
    ...lane("rail", rookie),
    ...lane("boat", rookie),
  ];
  const edges: [string, string][] = [];
  for (const path of ["road", "rail", "boat"] as const) {
    edges.push(["castle", `${path}-0`]);
    for (let i = 0; i < LANE_LEN - 1; i++) edges.push([`${path}-${i}`, `${path}-${i + 1}`]);
    edges.push([`${path}-${LANE_LEN - 1}`, "labyrinth"]);
  }
  edges.push(["cemetery", "boat-0"], ["cemetery", "rail-0"]);
  // Intersections: where a Vampire may change paths.
  edges.push(
    ["road-2", "rail-2"],
    ["rail-2", "boat-2"],
    ["road-6", "rail-6"],
    ["rail-7", "boat-7"],
  );
  return { side, width: 1650, height: 960, spaces, edges };
}

export const TEST_BOARD: BoardDef = buildTestBoard();
