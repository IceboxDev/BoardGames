import { getStrategy } from "./ai-strategies";
import { applyAction, createInitialState } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import type { AIStrategyId } from "./types";

const MAX_GAME_STEPS = 2000;

/**
 * Simulate a single Durak game with the given strategies.
 * Returns the index of the durak (loser), or -1 for a draw.
 */
export function simulateGame(strategies: AIStrategyId[], _firstPlayerOffset: number): number {
  const state = createInitialState(strategies.length, strategies);
  // Disable action log for tournament performance
  state.actionLog = undefined as never;

  let steps = 0;
  while (state.phase !== "game-over" && steps < MAX_GAME_STEPS) {
    const actions = getLegalActions(state);
    if (actions.length === 0) break;

    const activePlayer = getActivePlayer(state);
    const strategy = getStrategy(strategies[activePlayer]);
    const picked = strategy.pickAction(state, actions, activePlayer);

    applyAction(state, picked);
    steps++;
  }

  return state.durak ?? -1;
}

export interface TournamentResult {
  strategies: AIStrategyId[];
  gamesPlayed: number;
  losses: Record<string, number>;
}

export interface RunTournamentOptions {
  onProgress?: (completed: number, total: number) => void;
}

export function runTournament(
  strategies: AIStrategyId[],
  numGames: number,
  options?: RunTournamentOptions,
): TournamentResult {
  const losses: Record<string, number> = {};
  for (const s of strategies) {
    losses[s] = 0;
  }

  for (let i = 0; i < numGames; i++) {
    const durak = simulateGame(strategies, i);

    if (durak >= 0 && durak < strategies.length) {
      losses[strategies[durak]] = (losses[strategies[durak]] ?? 0) + 1;
    }

    options?.onProgress?.(i + 1, numGames);
  }

  return {
    strategies,
    gamesPlayed: numGames,
    losses,
  };
}
