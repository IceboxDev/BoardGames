import { strategyGuard } from "../../machines/seats";
import type { TournamentSimulator } from "../../tournament/simulator";
import { getStrategy } from "./ai-strategies";
import { applyAction, createInitialState } from "./game-engine";
import { durakOutcome } from "./outcome";
import { getActivePlayer, getLegalActions } from "./rules";
import { AI_STRATEGY_LABELS } from "./types";

const MAX_GAME_STEPS = 2000;
const toStrategy = strategyGuard("Durak", AI_STRATEGY_LABELS);

export const durakSimulator: TournamentSimulator = {
  playerCounts: [2, 3, 4, 5],

  simulate({ strategies, seed }) {
    const ids = strategies.map(toStrategy);
    const state = createInitialState(ids.length, ids, seed);

    for (let steps = 0; state.phase !== "game-over"; steps++) {
      if (steps >= MAX_GAME_STEPS)
        throw new Error(`Durak did not finish in ${MAX_GAME_STEPS} steps`);
      const actions = getLegalActions(state);
      if (actions.length === 0) throw new Error("Durak stalled with no legal action");
      const seat = getActivePlayer(state);
      applyAction(state, getStrategy(ids[seat]).pickAction(state, actions, seat));
    }
    return durakOutcome(state);
  },
};
