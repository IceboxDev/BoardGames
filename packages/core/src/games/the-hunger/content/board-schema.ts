// ---------------------------------------------------------------------------
// The board file format written by the dev board editor, and the checks a
// board must pass before a game can be played on it. Kept free of the
// engine so the editor's save endpoint (vite.config.ts) can import it alone.
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { BoardDef } from "../types";

export const REGIONS = ["castle", "cemetery", "mountains", "plains", "forest"] as const;
export const PATHS = ["road", "rail", "boat"] as const;
export const SPACE_EFFECTS = [
  "none",
  "castle",
  "cemetery",
  "chest",
  "chest-open",
  "crypt",
  "labyrinth",
  "market",
  "church",
  "mansion",
  "barracks",
  "ship",
  "tavern",
  "well",
] as const;

export const SpaceSchema = z.object({
  id: z.string().min(1),
  region: z.enum(REGIONS),
  path: z.enum(PATHS).nullable(),
  effect: z.enum(SPACE_EFFECTS),
  mountainPenalty: z.number().int().min(0).optional(),
  x: z.number(),
  y: z.number(),
});

export const BoardFileSchema = z.object({
  side: z.enum(["A", "B", "test"]),
  width: z.number().positive(),
  height: z.number().positive(),
  provisional: z.boolean().optional(),
  spaces: z.array(SpaceSchema),
  edges: z.array(z.tuple([z.string(), z.string()])),
});

export function parseBoard(raw: unknown): BoardDef {
  return BoardFileSchema.parse(raw);
}

export interface BoardProblem {
  /** Errors stop a game being played on the board; warnings are advice. */
  level: "error" | "warning";
  message: string;
  space?: string;
}

/** Everything wrong with a board, for the editor and for loading it. */
export function boardProblems(def: BoardDef): BoardProblem[] {
  const out: BoardProblem[] = [];
  const err = (message: string, space?: string) => out.push({ level: "error", message, space });
  const warn = (message: string, space?: string) => out.push({ level: "warning", message, space });

  const ids = new Set<string>();
  for (const s of def.spaces) {
    if (ids.has(s.id)) err(`Two spaces share the id "${s.id}"`, s.id);
    ids.add(s.id);
  }
  const count = (effect: string) => def.spaces.filter((s) => s.effect === effect).length;
  if (count("castle") !== 1) err(`Needs exactly one Castle (has ${count("castle")})`);
  if (count("labyrinth") !== 1) err(`Needs exactly one Labyrinth (has ${count("labyrinth")})`);
  if (count("tavern") !== 1) err(`Needs exactly one Tavern (has ${count("tavern")})`);
  if (count("well") === 0) err("Needs at least one Well");
  for (const region of ["mountains", "plains", "forest"] as const) {
    if (!def.spaces.some((s) => s.effect === "crypt" && s.region === region)) {
      err(`No Crypt in the ${region} (its Mission stack has nowhere to sit)`);
    }
  }
  for (const effect of ["market", "church", "mansion", "barracks"]) {
    if (count(effect) === 0) warn(`No ${effect}: that Human type can never be digested`);
  }
  if (count("chest") + count("chest-open") === 0) warn("No Chests: Bonus tokens are never used");

  const adj = new Map<string, string[]>([...ids].map((id) => [id, []]));
  const seen = new Set<string>();
  for (const [a, b] of def.edges) {
    if (!ids.has(a) || !ids.has(b)) {
      err(`A connection names a missing space (${a} – ${b})`);
      continue;
    }
    if (a === b) err(`A space is connected to itself`, a);
    const key = [a, b].sort().join("|");
    if (seen.has(key)) warn(`${a} and ${b} are connected twice`, a);
    seen.add(key);
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }

  for (const s of def.spaces) {
    const special = s.effect === "castle" || s.effect === "labyrinth" || s.region === "cemetery";
    if (s.effect === "castle" && s.region !== "castle")
      err("The Castle must be in the castle region", s.id);
    if (s.effect !== "castle" && s.region === "castle")
      err("Only the Castle is in the castle region", s.id);
    if (!special && s.path === null)
      warn(`${s.id} has no path (Road / Railroad / Boat) for turn order`, s.id);
    if (s.mountainPenalty !== undefined && s.region !== "mountains") {
      warn(`${s.id} has a sunrise penalty but is not in the Mountains`, s.id);
    }
    if ((adj.get(s.id) ?? []).length === 0) err(`${s.id} is not connected to anything`, s.id);
  }

  const castle = def.spaces.find((s) => s.effect === "castle");
  if (castle) {
    const reach = new Set([castle.id]);
    const queue = [castle.id];
    for (let i = 0; i < queue.length; i++) {
      for (const n of adj.get(queue[i]) ?? []) {
        if (!reach.has(n)) {
          reach.add(n);
          queue.push(n);
        }
      }
    }
    const cut = def.spaces.filter((s) => !reach.has(s.id));
    if (cut.length > 0) err(`${cut.length} space(s) cannot be reached from the Castle`, cut[0].id);
  }
  return out;
}

/**
 * Readable, stable ids: `castle` and `labyrinth` by role, every other space
 * `${region}-${n}`, numbered outward from the Castle (then left to right,
 * top to bottom). Spaces and links are sorted the same way, so a re-tidy of
 * an unchanged board is a no-op and file diffs stay small.
 */
export function tidyIds(def: BoardDef): BoardDef {
  const adj = new Map<string, string[]>(def.spaces.map((s) => [s.id, []]));
  for (const [a, b] of def.edges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  const castle = def.spaces.find((s) => s.effect === "castle");
  const dist = new Map<string, number>();
  if (castle) {
    dist.set(castle.id, 0);
    const queue = [castle.id];
    for (let i = 0; i < queue.length; i++) {
      for (const n of adj.get(queue[i]) ?? []) {
        if (!dist.has(n)) {
          dist.set(n, (dist.get(queue[i]) ?? 0) + 1);
          queue.push(n);
        }
      }
    }
  }
  const far = Number.POSITIVE_INFINITY;
  const ordered = [...def.spaces].sort(
    (a, b) => (dist.get(a.id) ?? far) - (dist.get(b.id) ?? far) || a.x - b.x || a.y - b.y,
  );
  const rename = new Map<string, string>();
  const counters = new Map<string, number>();
  for (const s of ordered) {
    if (s.effect === "castle" || s.effect === "labyrinth") {
      rename.set(s.id, s.effect);
      continue;
    }
    const n = (counters.get(s.region) ?? 0) + 1;
    counters.set(s.region, n);
    rename.set(s.id, `${s.region}-${n}`);
  }
  const id = (old: string) => rename.get(old) ?? old;
  const rank = new Map(ordered.map((s, i) => [id(s.id), i]));
  const edges = def.edges
    .map(([a, b]): [string, string] => {
      const [x, y] = [id(a), id(b)];
      return (rank.get(x) ?? 0) <= (rank.get(y) ?? 0) ? [x, y] : [y, x];
    })
    .sort(
      (e, f) =>
        (rank.get(e[0]) ?? 0) - (rank.get(f[0]) ?? 0) ||
        (rank.get(e[1]) ?? 0) - (rank.get(f[1]) ?? 0),
    );
  return {
    ...def,
    spaces: ordered.map((s) => ({ ...s, id: id(s.id) })),
    edges,
  };
}
