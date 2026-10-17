/**
 * The trainer's folder library: a member's own named folders and saved lines,
 * under the two colour roots (White, Black). A line is a move sequence from
 * the start position with a name ("Alapin main line" = `e2e4 c7c5 c2c3`); the
 * board jumps to its end. One document per member, saved whole with a version
 * check (`chess_trainer_library`).
 *
 * Every operation is pure and returns the library unchanged when it doesn't
 * apply (unknown id, a folder moved into itself, a limit reached).
 */
import { z } from "zod";
import { UciLineSchema } from "./imported-game";

export const LIBRARY_MAX_ITEMS = 2000;
export const LIBRARY_MAX_DEPTH = 8;

export const LibraryIdSchema = z.string().regex(/^[A-Za-z0-9_-]{6,32}$/);
const NameSchema = z.string().trim().min(1).max(60);

export interface LibraryLine {
  readonly kind: "line";
  readonly id: string;
  readonly name: string;
  /** UCI moves from the start, space-separated. */
  readonly moves: string;
}
export interface LibraryFolder {
  readonly kind: "folder";
  readonly id: string;
  readonly name: string;
  readonly children: readonly LibraryItem[];
}
export type LibraryItem = LibraryFolder | LibraryLine;

const LineSchema = z.object({
  kind: z.literal("line"),
  id: LibraryIdSchema,
  name: NameSchema,
  moves: UciLineSchema,
});
export const LibraryItemSchema: z.ZodType<LibraryItem> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    LineSchema,
    z.object({
      kind: z.literal("folder"),
      id: LibraryIdSchema,
      name: NameSchema,
      children: z.array(LibraryItemSchema),
    }),
  ]),
);

export type LibraryColor = "w" | "b";

export interface Library {
  readonly formatVersion: 1;
  readonly roots: { readonly w: readonly LibraryItem[]; readonly b: readonly LibraryItem[] };
}

export const LibrarySchema: z.ZodType<Library> = z
  .object({
    formatVersion: z.literal(1),
    roots: z.object({ w: z.array(LibraryItemSchema), b: z.array(LibraryItemSchema) }),
  })
  .refine((lib) => countItems(lib) <= LIBRARY_MAX_ITEMS, "Too many folders and lines")
  .refine((lib) => maxDepth(lib) <= LIBRARY_MAX_DEPTH, "Folders nest too deep");

export const EMPTY_LIBRARY: Library = { formatVersion: 1, roots: { w: [], b: [] } };

function walk(
  items: readonly LibraryItem[],
  depth: number,
  visit: (i: LibraryItem, d: number) => void,
) {
  for (const item of items) {
    visit(item, depth);
    if (item.kind === "folder") walk(item.children, depth + 1, visit);
  }
}

export function countItems(lib: Library): number {
  let n = 0;
  for (const c of ["w", "b"] as const) walk(lib.roots[c], 1, () => n++);
  return n;
}

function maxDepth(lib: Library): number {
  let max = 0;
  for (const c of ["w", "b"] as const) walk(lib.roots[c], 1, (_, d) => (max = Math.max(max, d)));
  return max;
}

export interface Located {
  readonly item: LibraryItem;
  readonly color: LibraryColor;
  /** Folders from the root down to (not including) the item. */
  readonly parents: readonly LibraryFolder[];
}

export function findItem(lib: Library, id: string): Located | null {
  for (const color of ["w", "b"] as const) {
    const search = (items: readonly LibraryItem[], parents: LibraryFolder[]): Located | null => {
      for (const item of items) {
        if (item.id === id) return { item, color, parents };
        if (item.kind === "folder") {
          const hit = search(item.children, [...parents, item]);
          if (hit) return hit;
        }
      }
      return null;
    };
    const hit = search(lib.roots[color], []);
    if (hit) return hit;
  }
  return null;
}

/** `items` with `fn` applied to the folder `id`'s children (null id = the list itself). */
function editChildren(
  items: readonly LibraryItem[],
  folderId: string | null,
  fn: (children: readonly LibraryItem[]) => readonly LibraryItem[],
): readonly LibraryItem[] {
  if (folderId === null) return fn(items);
  return items.map((item) =>
    item.kind !== "folder"
      ? item
      : item.id === folderId
        ? { ...item, children: fn(item.children) }
        : { ...item, children: editChildren(item.children, folderId, fn) },
  );
}

function withRoot(lib: Library, color: LibraryColor, items: readonly LibraryItem[]): Library {
  return { ...lib, roots: { ...lib.roots, [color]: items } };
}

/** Whether `parentId` (null = the root) is a folder under `color`. */
function isFolderIn(lib: Library, color: LibraryColor, parentId: string | null): boolean {
  if (parentId === null) return true;
  const at = findItem(lib, parentId);
  return at !== null && at.color === color && at.item.kind === "folder";
}

function insert(
  lib: Library,
  color: LibraryColor,
  parentId: string | null,
  item: LibraryItem,
): Library {
  if (findItem(lib, item.id) || !isFolderIn(lib, color, parentId)) return lib;
  const parents = parentId === null ? 0 : (findItem(lib, parentId)?.parents.length ?? 0) + 1;
  if (parents + 1 > LIBRARY_MAX_DEPTH || countItems(lib) >= LIBRARY_MAX_ITEMS) return lib;
  return withRoot(
    lib,
    color,
    editChildren(lib.roots[color], parentId, (c) => [...c, item]),
  );
}

export function addFolder(
  lib: Library,
  color: LibraryColor,
  parentId: string | null,
  id: string,
  name: string,
): Library {
  return insert(lib, color, parentId, { kind: "folder", id, name: name.trim(), children: [] });
}

export function addLine(
  lib: Library,
  color: LibraryColor,
  parentId: string | null,
  id: string,
  name: string,
  moves: readonly string[],
): Library {
  return insert(lib, color, parentId, {
    kind: "line",
    id,
    name: name.trim(),
    moves: moves.join(" "),
  });
}

function mapItems(
  items: readonly LibraryItem[],
  fn: (i: LibraryItem) => LibraryItem | null,
): readonly LibraryItem[] {
  return items.flatMap((item) => {
    const next = fn(item);
    if (!next) return [];
    return [next.kind === "folder" ? { ...next, children: mapItems(next.children, fn) } : next];
  });
}

export function renameItem(lib: Library, id: string, name: string): Library {
  const at = findItem(lib, id);
  const trimmed = name.trim();
  if (!at || !trimmed) return lib;
  return withRoot(
    lib,
    at.color,
    mapItems(lib.roots[at.color], (i) => (i.id === id ? { ...i, name: trimmed } : i)),
  );
}

export function removeItem(lib: Library, id: string): Library {
  const at = findItem(lib, id);
  if (!at) return lib;
  return withRoot(
    lib,
    at.color,
    mapItems(lib.roots[at.color], (i) => (i.id === id ? null : i)),
  );
}

/** Move an item into another folder of the same colour (null = the root), last. */
export function moveItem(lib: Library, id: string, parentId: string | null): Library {
  const at = findItem(lib, id);
  if (!at || parentId === id || !isFolderIn(lib, at.color, parentId)) return lib;
  // Not into its own subtree.
  if (parentId !== null && findItem(lib, parentId)?.parents.some((p) => p.id === id)) return lib;
  const without = removeItem(lib, id);
  const depthBelow = (item: LibraryItem): number =>
    item.kind === "folder" ? 1 + Math.max(0, ...item.children.map(depthBelow)) : 1;
  const parents = parentId === null ? 0 : (findItem(without, parentId)?.parents.length ?? 0) + 1;
  if (parents + depthBelow(at.item) > LIBRARY_MAX_DEPTH) return lib;
  return withRoot(
    without,
    at.color,
    editChildren(without.roots[at.color], parentId, (c) => [...c, at.item]),
  );
}

/** Every line in the library with its colour (for badges and lookups). */
export function allLines(lib: Library): { line: LibraryLine; color: LibraryColor }[] {
  const out: { line: LibraryLine; color: LibraryColor }[] = [];
  for (const color of ["w", "b"] as const) {
    walk(lib.roots[color], 1, (i) => {
      if (i.kind === "line") out.push({ line: i, color });
    });
  }
  return out;
}
