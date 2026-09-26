// Pure edits on a board being mapped in the dev board editor. Every function
// returns a new board; the editor keeps the old ones for undo.

import type { BoardDef, SpaceDef } from "@boardgames/core/games/the-hunger/types";

export type Draft = Omit<BoardDef, "spaces" | "edges"> & {
  spaces: SpaceDef[];
  edges: [string, string][];
};

/** The Castle and Labyrinth have fixed ids; everything else is `${region}-${n}`. */
export function nextId(board: Draft, space: Pick<SpaceDef, "region" | "effect">): string {
  if (space.effect === "castle" || space.effect === "labyrinth") {
    if (!board.spaces.some((s) => s.id === space.effect)) return space.effect;
  }
  const taken = new Set(board.spaces.map((s) => s.id));
  for (let n = 1; ; n++) {
    const id = `${space.region}-${n}`;
    if (!taken.has(id)) return id;
  }
}

export function addSpace(board: Draft, space: Omit<SpaceDef, "id">): { board: Draft; id: string } {
  const id = nextId(board, space);
  return { board: { ...board, spaces: [...board.spaces, { ...space, id }] }, id };
}

export function updateSpace(board: Draft, id: string, patch: Partial<SpaceDef>): Draft {
  return {
    ...board,
    spaces: board.spaces.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      // A sunrise penalty only exists in the Mountains.
      if (next.region !== "mountains") delete next.mountainPenalty;
      return next;
    }),
  };
}

/** Rename a space, carrying its connections along. Refuses a taken id. */
export function renameSpace(board: Draft, from: string, to: string): Draft {
  const id = to.trim();
  if (!id || id === from || board.spaces.some((s) => s.id === id)) return board;
  return {
    ...board,
    spaces: board.spaces.map((s) => (s.id === from ? { ...s, id } : s)),
    edges: board.edges.map(([a, b]) => [a === from ? id : a, b === from ? id : b]),
  };
}

export function removeSpace(board: Draft, id: string): Draft {
  return {
    ...board,
    spaces: board.spaces.filter((s) => s.id !== id),
    edges: board.edges.filter(([a, b]) => a !== id && b !== id),
  };
}

const same = (e: readonly [string, string], a: string, b: string) =>
  (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a);

export function hasEdge(board: Draft, a: string, b: string): boolean {
  return board.edges.some((e) => same(e, a, b));
}

/** Connect two spaces, or disconnect them if they already are. */
export function toggleEdge(board: Draft, a: string, b: string): Draft {
  if (a === b) return board;
  if (hasEdge(board, a, b)) return { ...board, edges: board.edges.filter((e) => !same(e, a, b)) };
  return { ...board, edges: [...board.edges, [a, b]] };
}

export function emptyBoard(side: "A" | "B", width: number, height: number): Draft {
  return { side, width, height, spaces: [], edges: [] };
}

/** The file the game loads: sorted for readable diffs, no editor-only state. */
export function toFile(board: Draft): BoardDef {
  const { provisional: _drop, ...rest } = board;
  return {
    ...rest,
    spaces: [...board.spaces],
    edges: board.edges.map(([a, b]) => (a < b ? [a, b] : [b, a]) as [string, string]),
  };
}
