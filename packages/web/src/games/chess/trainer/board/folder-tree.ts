/**
 * The folders as placed positions, and which folder owns each tree position:
 * shared by the folder rail and the map. A position belongs to the deepest
 * folder that reaches it through the tree, by any move order (the games'
 * sole-owner rule); the board is "in" the folder of the last position on its
 * line that a folder owns.
 */
import type { TrainerFolder } from "@boardgames/core/games/chess/trainer/folders";
import type { RepertoireTree } from "@boardgames/core/games/chess/trainer/tree";
import { useMemo } from "react";
import { reachableFrom } from "../tree-nav";
import { type LineStep, START, walkLine } from "./model";

export interface Placed {
  readonly folder: TrainerFolder;
  /** Folders from the top down to (not including) this one. */
  readonly parents: readonly TrainerFolder[];
  readonly fen: string;
  readonly key: string;
}

const FLAT = new WeakMap<readonly TrainerFolder[], Placed[]>();

export function flatten(
  folders: readonly TrainerFolder[],
  parents: readonly TrainerFolder[] = [],
): Placed[] {
  // A colour's folder list is fixed in code: placed once (it walks every folder's moves).
  if (parents.length === 0) {
    const known = FLAT.get(folders);
    if (known) return known;
    const placed = placeAll(folders, parents);
    FLAT.set(folders, placed);
    return placed;
  }
  return placeAll(folders, parents);
}

function placeAll(folders: readonly TrainerFolder[], parents: readonly TrainerFolder[]): Placed[] {
  return folders.flatMap((f) => {
    const end = walkLine(f.moves).at(-1) ?? START;
    return [
      { folder: f, parents, fen: end.fen, key: end.key },
      ...flatten(f.children, [...parents, f]),
    ];
  });
}

export const deepestFirst = (all: readonly Placed[]): Placed[] =>
  [...all].sort((a, b) => b.folder.moves.length - a.folder.moves.length);

/** "1…c5 Sicilian" → move "1…c5", name "Sicilian". */
export function splitName(name: string): { move: string; label: string } {
  const at = name.indexOf(" ");
  return at < 0
    ? { move: name, label: name }
    : { move: name.slice(0, at), label: name.slice(at + 1) };
}

/** Each tree position's folder: the deepest folder that reaches it through the tree. */
const OWNERS = new WeakMap<RepertoireTree, Map<string, ReadonlyMap<string, string>>>();

export function usePositionOwners(
  all: readonly Placed[],
  tree: RepertoireTree | null,
): ReadonlyMap<string, string> {
  return useMemo(() => {
    if (!tree) return new Map<string, string>();
    // One answer per tree and folder set: the rail and the map share it, and
    // switching colour back finds it ready.
    const sig = `${all.length}:${all[0]?.folder.id ?? ""}`;
    const cached = OWNERS.get(tree)?.get(sig);
    if (cached) return cached;
    const owner = new Map<string, string>();
    // Deepest folders first: they claim their positions before their parents can.
    for (const p of deepestFirst(all))
      for (const key of reachableFrom(tree, [p.key]))
        if (!owner.has(key)) owner.set(key, p.folder.id);
    const bySig = OWNERS.get(tree) ?? new Map<string, ReadonlyMap<string, string>>();
    bySig.set(sig, owner);
    OWNERS.set(tree, bySig);
    return owner;
  }, [all, tree]);
}

/**
 * Where the board is: back from the shown position, the first position that
 * is a folder's own (by any move order) or that the tree files under one.
 */
export function currentFolder(
  all: readonly Placed[],
  moves: readonly LineStep[],
  owner: ReadonlyMap<string, string>,
): Placed | null {
  const byId = new Map(all.map((p) => [p.folder.id, p]));
  const atKey = new Map<string, Placed>();
  for (const p of deepestFirst(all)) if (!atKey.has(p.key)) atKey.set(p.key, p);
  const keys = [START.key, ...moves.map((m) => m.key)];
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i] as string;
    const id = owner.get(key);
    const at = atKey.get(key) ?? (id ? byId.get(id) : undefined);
    if (at) return at;
  }
  return null;
}
