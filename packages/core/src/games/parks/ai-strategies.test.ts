import { describe, expect, it } from "vitest";
import { getStrategy } from "./ai-strategies";
import { applyAction, createInitialState } from "./game-engine";
import { getLegalActions } from "./rules";
import { scorePlayer } from "./scoring";
import { parksSimulator } from "./tournament-runner";
import type { AIStrategyId } from "./types";

function play(ids: [AIStrategyId, AIStrategyId], seed: number) {
  const state = createInitialState(ids, seed);
  const greedyMoves: string[] = [];
  for (let steps = 0; state.phase !== "game-over"; steps++) {
    if (steps > 5000) throw new Error("did not finish");
    const seat = state.activePlayer;
    const legal = getLegalActions(state, seat);
    const action = getStrategy(ids[seat]).pickAction(state, legal, seat);
    expect(legal).toContainEqual(action);
    if (ids[seat] === "greedy") greedyMoves.push(JSON.stringify(action));
    applyAction(state, action);
  }
  return { state, greedyMoves };
}

describe("greedy Parks AI", () => {
  it("only plays legal moves and is deterministic for a seed", () => {
    const a = play(["greedy", "greedy"], 11);
    const b = play(["greedy", "greedy"], 11);
    expect(a.greedyMoves).toEqual(b.greedyMoves);
    expect(a.state.players.map((p) => scorePlayer(p).total)).toEqual(
      b.state.players.map((p) => scorePlayer(p).total),
    );
  });

  it("does not change the game's own dice by looking ahead", () => {
    const state = createInitialState(["greedy", "greedy"], 5);
    const before = state.rngState;
    const legal = getLegalActions(state, state.activePlayer);
    getStrategy("greedy").pickAction(state, legal, state.activePlayer);
    expect(state.rngState).toBe(before);
  });

  it("outscores random play", () => {
    let greedy = 0;
    let random = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const ids: [AIStrategyId, AIStrategyId] =
        seed % 2 ? ["greedy", "random"] : ["random", "greedy"];
      const { state } = play(ids, seed);
      const g = ids.indexOf("greedy");
      greedy += scorePlayer(state.players[g]).total;
      random += scorePlayer(state.players[1 - g]).total;
    }
    expect(greedy).toBeGreaterThan(random);
  });

  it("plays a whole tournament game", () => {
    const outcome = parksSimulator.simulate({ strategies: ["greedy", "random"], seed: 3 });
    expect(outcome.kind).toBe("ranked");
  });
});
