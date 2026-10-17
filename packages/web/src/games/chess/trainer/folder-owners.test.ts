import { PositionIndex } from "@boardgames/core/games/chess/trainer/position-index";
import { describe, expect, it } from "vitest";
import { walkLine } from "./board/model";
import { folderOwners } from "./folder-owners";

const fenAfter = (moves: string) => walkLine(moves.split(" ")).at(-1)?.fen ?? "";

describe("folderOwners", () => {
  it("gives each game to the deepest folder it reaches, transpositions included", () => {
    const index = PositionIndex.build(
      [
        "e2e4 e7e5 g1f3 b8c6 f1b5", // main road: King's Pawn › Open Game › Nf3 › Nc6
        "g1f3 b8c6 e2e4 e7e5 f1c4", // the same position by another move order
        "e2e4 e7e5 g1f3 b8c6 f1b5", // an identical game: counts once
        "e2e4 c7c5 g1f3", // a sibling folder
        "d2d4 d7d5 c2c4", // no folder: stays at the start
      ].map((line, i) => ({ id: `g${i}`, moves: line.split(" "), result: "win" as const })),
    );
    const folders = [
      {
        fen: walkLine([]).at(-1)?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        moves: [],
      },
      { fen: fenAfter("e2e4"), moves: ["e2e4"] },
      { fen: fenAfter("e2e4 e7e5"), moves: ["e2e4", "e7e5"] },
      { fen: fenAfter("e2e4 e7e5 g1f3 b8c6"), moves: ["e2e4", "e7e5", "g1f3", "b8c6"] },
      { fen: fenAfter("e2e4 c7c5"), moves: ["e2e4", "c7c5"] },
    ];
    const { owned, transposed } = folderOwners(index, folders);
    // Positions count before each move, so every game runs a move past its folder.
    // start: the d4 game; 1.e4 and 1…e5: none directly; Nc6: 2 distinct lines; c5: 1.
    expect(owned).toEqual([1, 0, 0, 2, 1]);
    // The 1.Nf3 game reached the Nc6 folder by another move order.
    expect(transposed).toEqual([0, 0, 0, 1, 0]);
  });
});
