import { newGame } from "@boardgames/core/games/go/game";
import { describe, expect, it } from "vitest";
import { createGoServerAi } from "./go-ai.ts";

describe("Go AI worker pool", () => {
  it("thinks Brook's move on a worker thread and proposes dead stones", async () => {
    const ai = createGoServerAi(null);
    const game = newGame({ size: 9, komi: 7.5, handicap: 0 });
    const reply = await ai.chooseMove({ game, strategy: "mcts", timeMs: 300, seed: 1 });
    expect(reply.degraded).toBe(false);
    expect(reply.point).not.toBeNull();
    expect(await ai.deadStones(game)).toEqual([]);
  }, 30_000);
});
