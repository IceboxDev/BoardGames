/**
 * Which folder owns each of your games: the most specific (deepest) folder
 * position the game reaches, by any move order. Identical games count once.
 * A game that reached its folder by another move order than the folder's own
 * is a transposition.
 */
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import type { PositionIndex } from "@boardgames/core/games/chess/trainer/position-index";

export function folderOwners(
  index: PositionIndex,
  folders: readonly { fen: string; moves: readonly string[] }[],
): { owned: number[]; transposed: number[] } {
  const owner = new Map<number, number>();
  folders.forEach((f, fi) => {
    let key: string;
    try {
      key = positionKey(parseFen(f.fen));
    } catch {
      return;
    }
    for (const { game } of index.occurrences(key)) {
      const prev = owner.get(game);
      const prevDepth = prev === undefined ? -1 : (folders[prev]?.moves.length ?? -1);
      if (f.moves.length > prevDepth) owner.set(game, fi);
    }
  });
  const owned = folders.map(() => new Set<string>());
  const transposed = folders.map(() => new Set<string>());
  for (const [game, fi] of owner) {
    const moves = index.games[game]?.moves ?? [];
    const line = moves.join(" ");
    owned[fi]?.add(line);
    if ((folders[fi]?.moves ?? []).some((u, i) => moves[i] !== u)) transposed[fi]?.add(line);
  }
  return { owned: owned.map((s) => s.size), transposed: transposed.map((s) => s.size) };
}
