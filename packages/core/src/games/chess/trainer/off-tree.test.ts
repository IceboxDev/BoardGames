import { describe, expect, it } from "vitest";
import { applyMove } from "../engine/apply";
import { parseFen, positionKey, START_FEN, toFen } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import { moveToUci } from "../engine/uci";
import { type HeldPosition, offTreePositions, treeColor } from "./off-tree";

function positionAfter(line: string): { key: string; fen: string } {
  let pos = parseFen(START_FEN);
  for (const m of line.split(" ").filter(Boolean)) {
    const move = legalMoves(pos).find((x) => moveToUci(x) === m);
    if (!move) throw new Error(`illegal ${m} in ${line}`);
    pos = applyMove(pos, move);
  }
  return { key: positionKey(pos), fen: toFen(pos) };
}
const held = (line: string, kind: "user" | "opp"): HeldPosition => ({
  ...positionAfter(line),
  kind,
});

describe("offTreePositions", () => {
  // Your stars: 1.e4, 2.Nf3 after 1…e5, 2.d4 after 1…c6, 3.Bb5 after 2…Nc6.
  const choices = new Map([
    [positionAfter("").key, "e2e4"],
    [positionAfter("e2e4 e7e5").key, "g1f3"],
    [positionAfter("e2e4 c7c6").key, "d2d4"],
    [positionAfter("e2e4 e7e5 g1f3 b8c6").key, "f1b5"],
  ]);
  const best = new Map([[positionAfter("e2e4 e7e5 g1f3 b8c6 f1b5 a7a6").key, "b5a4"]]);
  const positions = [
    held("e2e4 c7c6 d2d4", "opp"), // your starred 2.d4
    held("e2e4 c7c6 c2c3", "opp"), // 2.c3: a different move than your star
    held("e2e4 c7c6 c2c3 d7d5", "user"), // past it
    held("e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4", "opp"), // the engine's move
    held("e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6", "opp"), // not the engine's move
    held("e2e4 e7e5 g1f3 b8c6 f1b5 g8f6", "user"), // not settled yet: kept
    held("e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1", "opp"), // past an unsettled position: kept
    held("d2d4", "opp"), // 1.d4, not your starred 1.e4
  ];

  it("drops what only a different move of yours reaches, and everything past it", () => {
    const off = offTreePositions({ color: "w", positions, best, choices });
    expect(off.map((p) => p.fen)).toEqual(
      [
        held("e2e4 c7c6 c2c3", "opp"),
        held("e2e4 c7c6 c2c3 d7d5", "user"),
        held("e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6", "opp"),
        held("d2d4", "opp"),
      ].map((p) => p.fen),
    );
  });

  it("keeps a position reached again by a transposition", () => {
    // 1.e4 c6 2.d4 d5 is in the tree; reaching the same position via 2.c3 doesn't matter.
    const same = held("e2e4 c7c6 d2d4 d7d5", "user");
    expect(offTreePositions({ color: "w", positions: [same], best, choices })).toEqual([]);
  });

  it("leaves the other colour's positions alone", () => {
    const black = held("e2e4", "user"); // Black to move: Black's tree
    expect(treeColor(black)).toBe("b");
    expect(offTreePositions({ color: "w", positions: [black], best, choices })).toEqual([]);
  });
});
