/**
 * The real engines, end to end: spawn Stockfish (and Fairy-Stockfish for
 * bughouse) from node_modules, ask for a move, check it is legal. Skips when
 * the engine packages aren't installed.
 */

import { createRequire } from "node:module";
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { describe, expect, it } from "vitest";
import { engineAgent, searchRequest, thinkTime } from "./chess-agent.ts";

const require = createRequire(import.meta.url);
const installed = (pkg: string) => {
  try {
    require.resolve(`${pkg}/package.json`);
    return true;
  } catch {
    return false;
  }
};

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("search requests", () => {
  it("sends the whole game for classical chess", () => {
    const req = searchRequest({
      variant: "chess",
      startFen: START,
      moves: ["e2e4", "e7e5"],
      fen: "irrelevant w",
      strategy: "sf-1800",
      clock: null,
      seed: 1,
    });
    expect(req.position).toBe(`fen ${START} moves e2e4 e7e5`);
    expect(req.go).toBe("movetime 400");
    expect(req.options).toContainEqual(["UCI_Elo", "1800"]);
  });

  it("thinks less when the clock is short", () => {
    const tier = { options: [], thinkMs: 1_500 };
    expect(thinkTime(tier, { w: 3_000, b: 60_000, inc: 0 }, "w", "chess")).toBe(100);
    expect(thinkTime(tier, null, "w", "chess")).toBe(1_500);
  });

  it("refuses an unknown strategy", () => {
    expect(() =>
      searchRequest({
        variant: "chess",
        startFen: START,
        moves: [],
        fen: START,
        strategy: "nope",
        clock: null,
        seed: 1,
      }),
    ).toThrow();
  });
});

describe.skipIf(!installed("stockfish"))("Stockfish", () => {
  it("answers with a legal move", async () => {
    const agent = engineAgent("chess");
    expect(agent).not.toBeNull();
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    const uci = await agent?.bestMove({
      variant: "chess",
      startFen: fen,
      moves: [],
      fen,
      strategy: "sf-2200",
      clock: { w: 60_000, b: 60_000, inc: 0 },
      seed: 1,
    });
    expect(legalMoves(parseFen(fen)).map(moveToUci)).toContain(uci);
  }, 30_000);
});

describe.skipIf(!installed("fairy-stockfish-nnue.wasm"))("Fairy-Stockfish bughouse", () => {
  it("drops from the pocket", async () => {
    const agent = engineAgent("bughouse");
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R[QPp] w KQkq - 2 3";
    const uci = await agent?.bestMove({
      variant: "bughouse",
      startFen: fen,
      moves: [],
      fen,
      strategy: "fairy-medium",
      clock: { w: 60_000, b: 60_000, inc: 0 },
      seed: 1,
    });
    expect(legalMoves(parseFen(fen, { bughouse: true })).map(moveToUci)).toContain(uci);
  }, 40_000);
});
