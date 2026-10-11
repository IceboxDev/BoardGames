import { strategyGuard } from "../../machines/seats";
import type { TournamentSimulator } from "../../tournament/simulator";
import { getStrategy } from "./ai-strategies";
import { applyAction, createInitialState } from "./game-engine";
import { parksOutcome } from "./outcome";
import { getLegalActions } from "./rules";
import { AI_STRATEGY_LABELS } from "./types";

const MAX_GAME_STEPS = 5000;
const toStrategy = strategyGuard("Parks", AI_STRATEGY_LABELS);

export const parksSimulator: TournamentSimulator = {
  playerCounts: [2],

  simulate({ strategies, seed }) {
    const ids = strategies.map(toStrategy);
    const state = createInitialState(ids, seed);
    for (let steps = 0; state.phase !== "game-over"; steps++) {
      if (steps >= MAX_GAME_STEPS)
        throw new Error(`Parks did not finish in ${MAX_GAME_STEPS} steps`);
      const seat = state.activePlayer;
      const legal = getLegalActions(state, seat);
      if (legal.length === 0)
        throw new Error(`Parks stalled with no legal action in ${state.phase}`);
      applyAction(state, getStrategy(ids[seat]).pickAction(state, legal, seat));
    }
    return parksOutcome(state);
  },
};
