import type { RepertoireTree, TreeNode } from "@boardgames/core/games/chess/trainer/tree";
import { describe, expect, it } from "vitest";
import { explorerRows, START, walkLine } from "./model";

const node = (over: Partial<TreeNode>): TreeNode => ({
  fen: START.fen,
  ply: 0,
  side: "user",
  status: "done",
  moves: [],
  following: 10,
  seen: 10,
  ...over,
});

describe("walkLine", () => {
  it("walks legal moves with SAN and stops at the first illegal one", () => {
    const steps = walkLine(["e2e4", "c7c5", "c2c3", "e2e4", "d7d5"]);
    expect(steps.map((s) => s.san)).toEqual(["e4", "c5", "c3"]);
    expect(steps[2]?.fen.split(" ")[1]).toBe("b");
  });
});

describe("explorerRows", () => {
  it("merges tree, your games, the database and the engine; tree moves first", () => {
    const afterE4 = walkLine(["e2e4"])[0];
    const tree: RepertoireTree = {
      formatVersion: 1,
      color: "w",
      settings: {
        handpickMoves: 0,
        engineDepth: 18,
        evalSpec: "BEST_MOVE_V2",
        speeds: [],
        minReplies: 3,
      },
      status: "ready",
      root: START.key,
      nodes: {
        [START.key]: node({
          moves: [{ uci: "e2e4", san: "e4", source: "engine", games: 8, following: 8 }],
        }),
        [afterE4?.key ?? ""]: node({ fen: afterE4?.fen ?? "", side: "opp", ply: 1 }),
      },
      stats: {
        games: 10,
        deviated: 2,
        ended: 0,
        waiting: 0,
        avgFollowPlies: 4,
        decisions: 0,
        awaiting: 0,
      },
    };
    const rows = explorerRows({
      fen: START.fen,
      node: tree.nodes[START.key] ?? null,
      tree,
      yours: [
        { uci: "d2d4", games: 2, score: 1 },
        { uci: "e2e4", games: 8, score: 5 },
      ],
      db: [
        { uci: "e2e4", games: 60, white: 30, draws: 5, black: 25 },
        { uci: "d2d4", games: 40, white: 20, draws: 10, black: 10 },
        { uci: "e1e2", games: 1, white: 0, draws: 0, black: 1 },
      ],
      engine: [{ uci: "g1f3", cp: 30, mate: null, depth: 20 }],
    });
    // Ke2 isn't legal from the start: the database row is dropped.
    expect(rows.map((r) => r.san)).toEqual(["e4", "d4", "Nf3"]);
    expect(rows[0]).toMatchObject({ tree: "engine", inTree: true, yours: { games: 8 } });
    expect(rows[0]?.db?.share).toBeCloseTo(60 / 101);
    expect(rows[1]).toMatchObject({ tree: null, inTree: false });
  });
});
