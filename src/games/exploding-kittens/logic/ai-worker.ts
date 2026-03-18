import { getStrategy } from "./ai-strategies";
import { runISMCTS } from "./mcts/ismcts";
import { getLegalActions } from "./rules";
import type { Action, GameState } from "./types";

interface AIWorkerMessage {
  state: GameState;
  playerIndex: number;
}

interface AIWorkerResponse {
  action: Action;
}

self.onmessage = (e: MessageEvent<AIWorkerMessage>) => {
  const { state, playerIndex } = e.data;
  const player = state.players[playerIndex];
  const strategyId = player.aiStrategy ?? "random";
  const strategy = getStrategy(strategyId);
  const legal = getLegalActions(state);

  if (legal.length === 0) {
    self.postMessage({
      action: { type: "pass-nope" },
    } satisfies AIWorkerResponse);
    return;
  }

  let action: Action;

  if (strategy.mctsConfig) {
    action = runISMCTS(state, playerIndex, strategy.mctsConfig);
  } else {
    action = strategy.pickAction(state, legal, playerIndex);
  }

  self.postMessage({ action } satisfies AIWorkerResponse);
};
