import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import { buildTree } from "@boardgames/core/games/chess/trainer/builder";
import { PositionIndex } from "@boardgames/core/games/chess/trainer/position-index";
import { TreeSettingsSchema } from "@boardgames/core/games/chess/trainer/tree";
import { describe, expect, it } from "vitest";
import { keyAfter, moveLabel, routeTo, sanOf, scoreText, topDeviations } from "./tree-nav";

const providers = {
  engineLines: async (_fen: string, n: number, depth: number) =>
    ["e2e4", "g1f3", "b8c6", "d7d6", "a7a6", "f1c4"]
      .slice(0, n)
      .map((uci) => ({ uci, cp: 20, mate: null, depth })),
  popularMoves: async () => [],
};

describe("tree navigation", () => {
  it("finds a route to a position and where games left the tree", async () => {
    const games = [
      { id: "a", moves: ["e2e4", "e7e5", "g1f3"], result: "win" as const },
      { id: "b", moves: ["e2e4", "e7e5", "f1c4"], result: "loss" as const },
      { id: "c", moves: ["d2d4"], result: "draw" as const },
    ];
    const tree = await buildTree(
      PositionIndex.build(games),
      "w",
      TreeSettingsSchema.parse({ handpickMoves: 0, engineDepth: 8 }),
      null,
      // e4 at the root, Nf3 after 1.e4 e5.
      {
        ...providers,
        engineLines: async (fen, n, depth) =>
          fen.startsWith("rnbqkbnr/pppp1ppp")
            ? [{ uci: "g1f3", cp: 30, mate: null, depth }]
            : providers.engineLines(fen, n, depth),
      },
    );
    const target = keyAfter(keyFen(tree, "e2e4"), "e7e5");
    expect(target).not.toBeNull();
    expect(routeTo(tree, target ?? "")?.map((s) => s.san)).toEqual(["e4", "e5"]);
    expect(topDeviations(tree).map((d) => d.games)).toEqual([1, 1]);
  });

  it("formats moves and scores", () => {
    expect(sanOf(START_FEN, "g1f3")).toBe("Nf3");
    expect(moveLabel(0, "e4")).toBe("1. e4");
    expect(moveLabel(3, "Nc6")).toBe("2… Nc6");
    expect(scoreText(START_FEN, { cp: 35, mate: null })).toBe("+0.3");
    expect(scoreText(START_FEN.replace(" w ", " b "), { cp: 35, mate: null })).toBe("-0.3");
    expect(scoreText(START_FEN.replace(" w ", " b "), { cp: null, mate: 2 })).toBe("-#2");
  });
});

function keyFen(tree: Awaited<ReturnType<typeof buildTree>>, uci: string): string {
  const key = keyAfter(START_FEN, uci) ?? "";
  return tree.nodes[key]?.fen ?? "";
}

describe("castling from lichess", () => {
  it("turns king-takes-rook castling into the king's move", async () => {
    const { normalizeUcis } = await import("./engine-provider");
    const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    expect(normalizeUcis(fen, [{ uci: "e1h1" }, { uci: "e1a1" }, { uci: "a1a8" }])).toEqual([
      { uci: "e1g1" },
      { uci: "e1c1" },
      { uci: "a1a8" },
    ]);
  });
});
