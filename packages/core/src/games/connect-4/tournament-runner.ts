import { strategyGuard } from "../../machines/seats";
import type { TournamentSimulator } from "../../tournament/simulator";
import { getStrategy } from "./ai-strategies";
import { connect4Manifest } from "./manifest";
import { connect4Outcome } from "./outcome";
import { applyAction, createInitialState, getLegalActions } from "./rules";
import { loadOpeningBooks } from "./solver/book";
import { AI_STRATEGY_LABELS } from "./types";

// Perfect plays the 7×6 opening from the book; every tournament process loads it once.
await loadOpeningBooks();

const MAX_GAME_STEPS = 1_000;
const toStrategy = strategyGuard("Connect 4", AI_STRATEGY_LABELS);

/** One classic 7×6 game; seats alternate who opens through the tournament's paired seeds. */
export const connect4Simulator: TournamentSimulator = {
  playerCounts: [2],

  simulate({ strategies, seed }) {
    const ids = strategies.map(toStrategy);
    const config = connect4Manifest.config.parse({});
    const state = createInitialState(ids, config, seed);
    for (let steps = 0; state.phase !== "game-over"; steps++) {
      if (steps >= MAX_GAME_STEPS)
        throw new Error(`Connect 4 did not finish in ${MAX_GAME_STEPS} steps`);
      const seat = state.currentPlayer;
      const legal = getLegalActions(state, seat);
      applyAction(state, getStrategy(ids[seat]).pickAction(state, legal, seat), seat);
    }
    return connect4Outcome(state);
  },
};
