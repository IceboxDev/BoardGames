/**
 * Your games per folder, from the build worker's game index: one count for the
 * folder rail and the map, so both list the same folders.
 */
import type { TrainerFolder } from "@boardgames/core/games/chess/trainer/folders";
import { useEffect, useState } from "react";
import type { Placed } from "./folder-tree";
import { START } from "./model";

/** Folder ownership of your games, from the build worker. */
export type LoadFolderCounts = (
  folders: readonly { fen: string; moves: readonly string[] }[],
) => Promise<{ owned: number[]; transposed: number[] }>;

export interface FolderGames {
  readonly counts: ReadonlyMap<string, number> | null;
  readonly transposed: ReadonlyMap<string, number> | null;
  readonly total: number | null;
}

/**
 * Each folder's games: the ones it owns itself (the most specific folder a
 * game reaches, by any move order) plus its subfolders'. `total` is every
 * game of yours in this colour.
 */
export function useFolderGames(all: readonly Placed[], load: LoadFolderCounts | null): FolderGames {
  const [state, setState] = useState<{
    counts: Map<string, number>;
    transposed: Map<string, number>;
    total: number;
  } | null>(null);
  useEffect(() => {
    setState(null);
    if (!load) return;
    let live = true;
    // The start position first: games reaching no folder stay there.
    const request = [
      { fen: START.fen, moves: [] as string[] },
      ...all.map((p) => ({ fen: p.fen, moves: [...p.folder.moves] })),
    ];
    load(request)
      .then(({ owned, transposed }) => {
        if (!live) return;
        const counts = new Map<string, number>();
        const trans = new Map<string, number>();
        const sum = (f: TrainerFolder): [number, number] => {
          const i = all.findIndex((p) => p.folder === f) + 1;
          let n = owned[i] ?? 0;
          let t = transposed[i] ?? 0;
          for (const c of f.children) {
            const [cn, ct] = sum(c);
            n += cn;
            t += ct;
          }
          counts.set(f.id, n);
          trans.set(f.id, t);
          return [n, t];
        };
        let total = owned[0] ?? 0;
        for (const top of all.filter((p) => p.parents.length === 0)) total += sum(top.folder)[0];
        setState({ counts, transposed: trans, total });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [all, load]);
  return {
    counts: state?.counts ?? null,
    transposed: state?.transposed ?? null,
    total: state?.total ?? null,
  };
}
