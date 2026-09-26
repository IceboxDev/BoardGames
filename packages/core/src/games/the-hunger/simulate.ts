import { pickAiAction } from "./ai-strategies";
import { applyActionPure, createInitialState } from "./game-engine";
import { getActivePlayer } from "./rules";
import type { AIStrategyId, GameOptions, GameState } from "./types";

/** Play a whole game with AI seats only. Throws if it fails to terminate. */
export function simulate(
  strategies: AIStrategyId[],
  seed: number,
  options?: Partial<GameOptions>,
  maxSteps = 20_000,
): { state: GameState; steps: number } {
  let state = createInitialState({ playerCount: strategies.length, strategies, seed, options });
  let steps = 0;
  while (state.phase !== "game-over") {
    if (++steps > maxSteps) throw new Error(`seed ${seed}: no end after ${maxSteps} actions`);
    const seat = getActivePlayer(state);
    state = applyActionPure(state, seat, pickAiAction(state));
  }
  return { state, steps };
}
