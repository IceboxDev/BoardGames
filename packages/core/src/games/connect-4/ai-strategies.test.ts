import { describe, expect, it } from "vitest";
import { AI_BUDGETS, getStrategy } from "./ai-strategies";
import { connect4Manifest } from "./manifest";
import { applyAction, createInitialState, getLegalActions } from "./rules";
import { loadOpeningBook } from "./solver/book";
import type { AIStrategyId, GameState } from "./types";

function play(
  a: AIStrategyId,
  b: AIStrategyId,
  seed: number,
  config: Record<string, unknown> = {},
) {
  const ids = [a, b];
  const state = createInitialState(ids, connect4Manifest.config.parse(config), seed);
  while (state.phase === "playing") {
    const seat = state.currentPlayer;
    applyAction(
      state,
      getStrategy(ids[seat]).pickAction(state, getLegalActions(state, seat), seat),
      seat,
    );
  }
  return state.seriesWinner;
}

function position(columns: number[]): GameState {
  const state = createInitialState([null, null], connect4Manifest.config.parse({}), 1);
  for (const column of columns) applyAction(state, { type: "drop", column }, state.currentPlayer);
  return state;
}

describe("Connect 4 AI", () => {
  // Opening positions are beyond the solver; keep its tries short here.
  AI_BUDGETS.perfectSolverNodes = 100_000;
  AI_BUDGETS.deep.nodeBudget = 100_000;

  it("every bot takes a win in one", () => {
    const state = position([0, 6, 1, 6, 2, 5]); // Red: column 3 wins
    for (const id of ["blocker", "lookahead", "deep", "perfect"] as const) {
      const action = getStrategy(id).pickAction(state, getLegalActions(state, 0), 0);
      expect(action, id).toEqual({ type: "drop", column: 3 });
    }
  });

  it("every bot blocks a win in one", () => {
    const state = position([0, 6, 1, 6, 5, 6]); // Yellow threatens column 6
    for (const id of ["blocker", "lookahead", "deep", "perfect"] as const) {
      const action = getStrategy(id).pickAction(state, getLegalActions(state, 0), 0);
      expect(action, id).toEqual({ type: "drop", column: 6 });
    }
  });

  it("Perfect varies its play from game to game", async () => {
    // Perfect against itself on 6×5, solved from the first disc by its book: seeds part ways.
    await loadOpeningBook(6, 5);
    const budget = AI_BUDGETS.perfectSolverNodes;
    AI_BUDGETS.perfectSolverNodes = 3_000_000;
    const game = (seed: number) => {
      const state = createInitialState(
        ["perfect", "perfect"],
        connect4Manifest.config.parse({ board: "6x5" }),
        seed,
      );
      const columns: number[] = [];
      while (state.phase === "playing" && columns.length < 30) {
        const seat = state.currentPlayer;
        const action = getStrategy("perfect").pickAction(state, getLegalActions(state, seat), seat);
        if (action.type === "drop") columns.push(action.column);
        applyAction(state, action, seat);
      }
      return columns.join("");
    };
    const games = new Set([1, 2, 3, 4, 5, 6].map(game));
    AI_BUDGETS.perfectSolverNodes = budget;
    expect(games.size).toBeGreaterThan(1);
  });

  it("each rung beats the one below", () => {
    const score = (a: AIStrategyId, b: AIStrategyId, games: number) => {
      let won = 0;
      for (let g = 0; g < games; g++) {
        // Alternate who opens by swapping seats.
        const w = g % 2 === 0 ? play(a, b, g) : play(b, a, g);
        if (w === (g % 2 === 0 ? 0 : 1)) won++;
      }
      return won / games;
    };
    expect(score("lookahead", "blocker", 10)).toBeGreaterThan(0.6);
  });

  it("plays PopOut and other boards", () => {
    expect([0, 1, null]).toContain(play("lookahead", "blocker", 1, { popOut: true }));
    expect([0, 1, null]).toContain(play("blocker", "lookahead", 2, { board: "8x7" }));
  });
});
