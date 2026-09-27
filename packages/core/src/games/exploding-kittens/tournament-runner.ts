import { createRng } from "../../lib/rng";
import { strategyGuard } from "../../machines/seats";
import type { TournamentSimulator } from "../../tournament/simulator";
import { getStrategy } from "./ai-strategies";
import { applyAction, createInitialState } from "./game-engine";
import { runISMCTS } from "./mcts/ismcts";
import { explodingKittensOutcome } from "./outcome";
import { getActiveDecider, getLegalActions } from "./rules";
import { AI_STRATEGY_LABELS } from "./types";

const MAX_GAME_STEPS = 2000;
const toStrategy = strategyGuard("Exploding Kittens", AI_STRATEGY_LABELS);

export const explodingKittensSimulator: TournamentSimulator = {
  playerCounts: [2, 3, 4, 5],

  simulate({ strategies, seed }) {
    const ids = strategies.map(toStrategy);
    const rng = createRng(seed);
    const state = createInitialState(ids.length, ids, rng);
    state.actionLog = undefined;

    for (let steps = 0; state.phase !== "game-over"; steps++) {
      if (steps >= MAX_GAME_STEPS) {
        throw new Error(`Exploding Kittens did not finish in ${MAX_GAME_STEPS} steps`);
      }
      const actions = getLegalActions(state);
      if (actions.length === 0) throw new Error("Exploding Kittens stalled with no legal action");
      const seat = getActiveDecider(state);
      const strategy = getStrategy(ids[seat]);
      const action = strategy.mctsConfig
        ? runISMCTS(state, seat, strategy.mctsConfig)
        : strategy.pickAction(state, actions, seat);
      applyAction(state, action, rng);
    }
    return explodingKittensOutcome(state);
  },
};
