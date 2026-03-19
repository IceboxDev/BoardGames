import { getStrategy } from "./ai-strategies";
import { applyAction, createInitialState } from "./game-engine";
import { runISMCTS } from "./mcts/ismcts";
import { getActiveDecider, getLegalActions } from "./rules";
import type { Action, AIStrategyId } from "./types";

const MAX_GAME_STEPS = 2000;

export function simulateGame(strategies: AIStrategyId[], firstPlayerOffset: number): number {
  const playerCount = strategies.length;
  const state = createInitialState(playerCount, strategies as (AIStrategyId | null)[]);
  state.actionLog = undefined;
  state.currentPlayerIndex = firstPlayerOffset % playerCount;

  let steps = 0;
  while (state.phase !== "game-over" && steps < MAX_GAME_STEPS) {
    const actions = getLegalActions(state);
    if (actions.length === 0) break;

    const activePlayer = getActiveDecider(state);
    const strategy = getStrategy(strategies[activePlayer]);

    let picked: Action;
    if (strategy.mctsConfig) {
      picked = runISMCTS(state, activePlayer, strategy.mctsConfig);
    } else {
      picked = strategy.pickAction(state, actions, activePlayer);
    }

    applyAction(state, picked);
    steps++;
  }

  return state.winner ?? -1;
}

export interface TournamentResult {
  strategies: AIStrategyId[];
  gamesPlayed: number;
  wins: Record<string, number>;
}

export interface RunTournamentOptions {
  onProgress?: (completed: number, total: number) => void;
}

export function runTournament(
  strategies: AIStrategyId[],
  numGames: number,
  options?: RunTournamentOptions,
): TournamentResult {
  const playerCount = strategies.length;

  const wins: Record<string, number> = {};
  for (const s of strategies) {
    wins[s] = 0;
  }

  for (let i = 0; i < numGames; i++) {
    const winner = simulateGame(strategies, i);

    if (winner >= 0 && winner < playerCount) {
      wins[strategies[winner]] = (wins[strategies[winner]] ?? 0) + 1;
    }

    options?.onProgress?.(i + 1, numGames);
  }

  return {
    strategies,
    gamesPlayed: numGames,
    wins,
  };
}
