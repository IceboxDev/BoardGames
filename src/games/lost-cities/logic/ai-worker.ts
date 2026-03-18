import { getStrategy } from "./ai-strategies";
import { runISMCTS } from "./mcts/ismcts";
import type { AIMove, GameState } from "./types";

self.onmessage = (e: MessageEvent<GameState>) => {
  const strategy = getStrategy(e.data.aiEngine);
  const move: AIMove = runISMCTS(e.data, strategy);
  self.postMessage(move);
};
