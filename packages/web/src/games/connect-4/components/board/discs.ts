import type { MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";

export interface PlacedDisc {
  /** Stable across pops: the index of the drop that placed it. */
  id: number;
  column: number;
  row: number;
  player: Seat;
}

/**
 * The discs on the board with stable identities, rebuilt from the game's
 * moves — so a drop animates in and a pop slides its column down rather than
 * every disc re-rendering.
 */
export function placedDiscs(cols: number, moves: readonly MoveRecord[]): PlacedDisc[] {
  const columns: PlacedDisc[][] = Array.from({ length: cols }, () => []);
  moves.forEach((move, index) => {
    const col = columns[move.column];
    if (move.type === "drop") {
      col.push({ id: index, column: move.column, row: col.length, player: move.player });
    } else {
      col.shift();
      col.forEach((d, row) => {
        d.row = row;
      });
    }
  });
  return columns.flat();
}
