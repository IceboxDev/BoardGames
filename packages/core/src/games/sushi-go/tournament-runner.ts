import type { StrategyFn, StrategyId } from "./ai/strategy";
import { createStrategy } from "./ai/strategy";
import { applyRevealAndRotate, applySelection, createInitialState } from "./game-engine";
import type { GameState } from "./types";

export interface SimResult {
  scoreA: number;
  scoreB: number;
}

export function simulateGame(
  strategyAId: StrategyId,
  strategyBId: StrategyId,
  aPlaysFirst: boolean,
  _gameIndex: number,
): SimResult {
  const stratA = createStrategy(strategyAId);
  const stratB = createStrategy(strategyBId);
  const strats: [StrategyFn, StrategyFn] = aPlaysFirst ? [stratA, stratB] : [stratB, stratA];

  let gs = createInitialState(2);

  while (gs.phase !== "game-over") {
    gs = applyBothSelections(gs, strats);
    gs = applyRevealAndRotate(gs);
  }

  const score0 = gs.totalScores[0];
  const score1 = gs.totalScores[1];

  return {
    scoreA: aPlaysFirst ? score0 : score1,
    scoreB: aPlaysFirst ? score1 : score0,
  };
}

function applyBothSelections(gs: GameState, strats: [StrategyFn, StrategyFn]): GameState {
  let state = gs;
  for (let i = 0; i < 2; i++) {
    const selection = strats[i](state, i);
    state = applySelection(state, i, selection);
  }
  return state;
}
