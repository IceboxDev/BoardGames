import { describe, expect, it } from "vitest";
import { applyMove } from "../engine/apply";
import { parseFen, positionKey, START_FEN, toFen } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import { moveToUci } from "../engine/uci";
import { deviationOf } from "./deviation";
import { type RepertoireTree, type TreeNode, TreeSettingsSchema } from "./tree";

function after(line: string) {
  let pos = parseFen(START_FEN);
  for (const m of line.split(" ").filter(Boolean)) {
    const move = legalMoves(pos).find((x) => moveToUci(x) === m);
    if (!move) throw new Error(m);
    pos = applyMove(pos, move);
  }
  return pos;
}

/** A White tree: 1.e4, then 2.Nf3 after 1…e5 and 2.d4 after 1…c6. */
function tree(): RepertoireTree {
  const node = (line: string, side: "user" | "opp", moves: string[]): [string, TreeNode] => {
    const pos = after(line);
    return [
      positionKey(pos),
      {
        fen: toFen(pos),
        ply: line.split(" ").filter(Boolean).length,
        side,
        status: "done",
        moves: moves.map((uci) => ({
          uci,
          san: uci,
          source: side === "user" ? "handpicked" : "played",
          games: 1,
          following: 1,
        })),
        following: 1,
        seen: 1,
      },
    ];
  };
  return {
    formatVersion: 1,
    color: "w",
    settings: TreeSettingsSchema.parse({}),
    status: "ready",
    root: positionKey(after("")),
    nodes: Object.fromEntries([
      node("", "user", ["e2e4"]),
      node("e2e4", "opp", ["e7e5", "c7c6"]),
      node("e2e4 e7e5", "user", ["g1f3"]),
      node("e2e4 c7c6", "user", ["d2d4"]),
    ]),
    stats: {
      games: 1,
      deviated: 0,
      ended: 0,
      waiting: 0,
      avgFollowPlies: 0,
      decisions: 0,
      awaiting: 0,
    },
  };
}

describe("deviationOf", () => {
  it("finds your move that left the tree", () => {
    expect(deviationOf(tree(), START_FEN, ["e2e4", "e7e5", "f1c4"])).toEqual({
      kind: "you-left",
      index: 2,
      played: "f1c4",
      expected: "g1f3",
      source: "handpicked",
    });
  });
  it("finds the opponent's reply the tree doesn't prepare", () => {
    expect(deviationOf(tree(), START_FEN, ["e2e4", "d7d5"])).toEqual({
      kind: "they-left",
      index: 1,
      played: "d7d5",
    });
  });
  it("says a game stayed in, to its end or past the tree's last position", () => {
    expect(deviationOf(tree(), START_FEN, ["e2e4", "c7c6"])).toEqual({ kind: "stayed", plies: 2 });
    expect(deviationOf(tree(), START_FEN, ["e2e4", "c7c6", "d2d4", "d7d5"])).toEqual({
      kind: "stayed",
      plies: 3,
    });
  });
});
