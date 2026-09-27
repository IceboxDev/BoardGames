import type { TournamentSimulator } from "../../tournament/simulator";
import { ALL_STRATEGIES } from "./ai-strategies";
import { applyDraw, applyPlay, createInitialState } from "./game-engine";
import { runISMCTS } from "./mcts/ismcts";
import { lostCitiesOutcome } from "./outcome";
import type { PlayerIndex } from "./types";

function strategyById(id: string) {
  const strategy = ALL_STRATEGIES.find((s) => s.id === id);
  if (!strategy) throw new Error(`Unknown Lost Cities AI strategy "${id}"`);
  return strategy;
}

export const lostCitiesSimulator: TournamentSimulator = {
  playerCounts: [2],

  simulate({ strategies, seed }) {
    const seats = strategies.map(strategyById);
    let state = createInitialState(seed);
    while (state.phase !== "game-over") {
      const seat = state.currentPlayer as PlayerIndex;
      const move = runISMCTS(state, seat, seats[seat]);
      state = applyDraw(applyPlay(state, move.play), move.draw);
    }
    return lostCitiesOutcome(state);
  },
};
