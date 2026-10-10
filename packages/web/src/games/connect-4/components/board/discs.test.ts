import type { MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { describe, expect, it } from "vitest";
import { placedDiscs } from "./discs";

const drop = (column: number, player: Seat): MoveRecord => ({
  type: "drop",
  column,
  row: 0,
  player,
});
const pop = (column: number, player: Seat): MoveRecord => ({ type: "pop", column, row: 0, player });

describe("placedDiscs", () => {
  it("stacks drops, each disc identified by the drop that placed it", () => {
    const discs = placedDiscs(3, [drop(1, 0), drop(1, 1), drop(2, 0)]);
    expect(discs).toEqual([
      { id: 0, column: 1, row: 0, player: 0 },
      { id: 1, column: 1, row: 1, player: 1 },
      { id: 2, column: 2, row: 0, player: 0 },
    ]);
  });

  it("slides a popped column down, keeping every survivor's identity", () => {
    const discs = placedDiscs(2, [drop(0, 0), drop(0, 1), drop(0, 0), pop(0, 0)]);
    expect(discs).toEqual([
      { id: 1, column: 0, row: 0, player: 1 },
      { id: 2, column: 0, row: 1, player: 0 },
    ]);
  });
});
