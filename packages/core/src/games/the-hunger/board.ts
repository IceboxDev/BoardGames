// ---------------------------------------------------------------------------
// Board graph: adjacency, distances, and every kind of movement the rules
// allow (a free walk, Form of Bat, Form of Mist, Spicy, Confuse, a push).
// ---------------------------------------------------------------------------

import { BOARDS } from "./content/boards";
import type { BoardDef, BoardId, GameOptions, Mode, PathKind, Region, SpaceDef } from "./types";

export interface BoardGraph {
  def: BoardDef;
  castle: string;
  labyrinth: string;
  spaces: ReadonlyMap<string, SpaceDef>;
  adj: ReadonlyMap<string, readonly string[]>;
  castleDist: ReadonlyMap<string, number>;
  labyrinthDist: ReadonlyMap<string, number>;
  wells: ReadonlySet<string>;
}

export function bfs(
  adj: ReadonlyMap<string, readonly string[]>,
  from: string,
): Map<string, number> {
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    const d = dist.get(at) ?? 0;
    for (const next of adj.get(at) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      queue.push(next);
    }
  }
  return dist;
}

export function buildGraph(def: BoardDef): BoardGraph {
  const spaces = new Map(def.spaces.map((s) => [s.id, s]));
  const adj = new Map<string, string[]>(def.spaces.map((s) => [s.id, []]));
  for (const [a, b] of def.edges) {
    if (!spaces.has(a) || !spaces.has(b)) throw new Error(`Edge ${a}-${b} names a missing space`);
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  for (const list of adj.values()) list.sort();
  // The Castle contains a Well (Spicy, Mist).
  const wells = new Set(
    def.spaces.filter((s) => s.effect === "well" || s.effect === "castle").map((s) => s.id),
  );
  const only = (effect: string) => {
    const found = def.spaces.find((s) => s.effect === effect);
    if (!found) throw new Error(`Board ${def.side} has no ${effect}`);
    return found.id;
  };
  const castle = only("castle");
  const labyrinth = only("labyrinth");
  return {
    def,
    castle,
    labyrinth,
    spaces,
    adj,
    castleDist: bfs(adj, castle),
    labyrinthDist: bfs(adj, labyrinth),
    wells,
  };
}

const GRAPHS: Record<BoardId, BoardGraph> = {
  A: buildGraph(BOARDS.A),
  B: buildGraph(BOARDS.B),
  test: buildGraph(BOARDS.test),
};

/** The board a game is played on (Rookie: side A, Elder: side B, or the test layout). */
export function graphFor(options: Pick<GameOptions, "board">): BoardGraph {
  return GRAPHS[options.board];
}

/** The board a mode plays on by default. */
export function boardForMode(mode: Mode): BoardId {
  return mode === "rookie" ? "A" : "B";
}

export function space(g: BoardGraph, id: string): SpaceDef {
  const s = g.spaces.get(id);
  if (!s) throw new Error(`Unknown space ${id}`);
  return s;
}

// ---------------------------------------------------------------------------
// Turn-order ranking
// ---------------------------------------------------------------------------

const REGION_RANK: Record<Region, number> = {
  forest: 0,
  plains: 1,
  mountains: 2,
  cemetery: 3,
  castle: 4,
};
const PATH_RANK: Record<PathKind, number> = { road: 0, rail: 1, boat: 2 };

/**
 * Smaller plays earlier: region, then path, then closeness to the Labyrinth.
 * The Labyrinth itself — the furthest point from the Castle, and path-less —
 * plays before everyone else.
 */
export function orderKey(g: BoardGraph, spaceId: string): [number, number, number] {
  if (spaceId === g.labyrinth) return [-1, -1, 0];
  const s = space(g, spaceId);
  return [
    REGION_RANK[s.region],
    s.path ? PATH_RANK[s.path] : 3,
    g.labyrinthDist.get(spaceId) ?? Number.POSITIVE_INFINITY,
  ];
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export interface WalkOptions {
  /** Form of Bat: passing a Well or an occupied space costs nothing. */
  bat: boolean;
  occupied: ReadonlySet<string>;
}

/**
 * Every space a free walk can END on, with the cheapest Speed it costs.
 *
 * "One general direction" is a simple path: no space is visited twice, so a
 * Vampire can change paths at an intersection but never double back. The
 * Castle is a dead end — once entered it cannot be left.
 */
export function walkDestinations(
  g: BoardGraph,
  from: string,
  speed: number,
  opts: WalkOptions,
): Map<string, number> {
  const best = new Map<string, number>();
  const visited = new Set<string>([from]);
  const skip = (id: string) => opts.bat && (g.wells.has(id) || opts.occupied.has(id));

  const dfs = (at: string, spent: number) => {
    if (at === g.castle && at !== from) return;
    for (const next of g.adj.get(at) ?? []) {
      if (visited.has(next)) continue;
      // Ending on a space always costs a step; passing a skippable one is free.
      const endCost = spent + 1;
      if (endCost > speed) continue;
      const prev = best.get(next);
      if (prev === undefined || endCost < prev) best.set(next, endCost);
      visited.add(next);
      dfs(next, skip(next) ? spent : endCost);
      visited.delete(next);
    }
  };
  dfs(from, 0);
  return best;
}

/** Form of Mist: every Well reachable without passing another Well. */
export function mistDestinations(g: BoardGraph, from: string): string[] {
  const out = new Set<string>();
  const seen = new Set<string>([from]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    for (const next of g.adj.get(queue[i]) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (g.wells.has(next)) out.add(next);
      else queue.push(next);
    }
  }
  return [...out].sort();
}

/**
 * Spicy: forced toward the closest Well. Returns the legal end spaces with
 * their cost, or `[]` when already on a Well (no forced move that turn).
 */
export function spicyDestinations(
  g: BoardGraph,
  from: string,
  speed: number,
): { to: string; spent: number; reachedWell: boolean }[] {
  if (g.wells.has(from) || speed <= 0) return [];
  const fromStart = bfs(g.adj, from);
  let nearest = Number.POSITIVE_INFINITY;
  for (const w of g.wells)
    nearest = Math.min(nearest, fromStart.get(w) ?? Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nearest)) return [];
  if (nearest <= speed) {
    return [...g.wells]
      .filter((w) => fromStart.get(w) === nearest)
      .sort()
      .map((to) => ({ to, spent: nearest, reachedWell: true }));
  }
  // Not enough Speed: spend it all on a shortest route to a nearest Well.
  const toWell = new Map<string, number>();
  for (const w of g.wells) {
    for (const [id, d] of bfs(g.adj, w)) toWell.set(id, Math.min(toWell.get(id) ?? d, d));
  }
  const out: { to: string; spent: number; reachedWell: boolean }[] = [];
  for (const [id, d] of fromStart) {
    if (d === speed && toWell.get(id) === nearest - speed) {
      out.push({ to: id, spent: speed, reachedWell: false });
    }
  }
  return out.sort((a, b) => a.to.localeCompare(b.to));
}

/** Confuse: 4 spaces along a shortest route to the Labyrinth, never beyond it. */
export function confuseDestination(g: BoardGraph, from: string, steps = 4): string {
  let at = from;
  for (let i = 0; i < steps; i++) {
    const d = g.labyrinthDist.get(at) ?? 0;
    if (d === 0) break;
    const next = (g.adj.get(at) ?? []).find((n) => (g.labyrinthDist.get(n) ?? 0) === d - 1);
    if (!next) break;
    at = next;
  }
  return at;
}

/** Where a pushed Vampire may be placed: any adjacent space but the Castle. */
export function pushDestinations(g: BoardGraph, from: string): string[] {
  return (g.adj.get(from) ?? []).filter((id) => id !== g.castle);
}
