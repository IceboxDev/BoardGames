import { strategyGuard } from "../../machines/seats";
import type { TournamentSimulator } from "../../tournament/simulator";
import { hungerOutcome } from "./outcome";
import { simulate } from "./simulate";
import { type AIStrategyId, ALL_STRATEGIES, type GameOptions, type Mode } from "./types";

// Headless AI-vs-AI games: the local tournament runner's simulator, and the
// seeded self-play the bench and the C++ parity dumps replay.

/** The seed of self-play game `gameIndex` — shared with the C++ parity fixtures. */
export function seedForGame(gameIndex: number): number {
  return (Math.imul(gameIndex + 1, 0x9e3779b1) ^ 0x4a11) >>> 0;
}

export interface HungerGameOutcome {
  /** Winning seat, or -1 for a shared win. */
  winner: number;
  scores: number[];
}

/** One seeded all-AI game. Throws if it does not finish. */
export function simulateGame(
  strategies: AIStrategyId[],
  gameIndex: number,
  options: { mode?: Mode; seed?: number } = {},
): HungerGameOutcome {
  const gameOptions: Partial<GameOptions> = options.mode ? { mode: options.mode } : {};
  const { state } = simulate(strategies, options.seed ?? seedForGame(gameIndex), gameOptions);
  return { winner: state.result?.winner ?? -1, scores: state.result?.scores ?? [] };
}

const toStrategy = strategyGuard("The Hunger", ALL_STRATEGIES);

export const theHungerSimulator: TournamentSimulator = {
  playerCounts: [2, 3, 4, 5, 6],

  simulate({ strategies, seed }) {
    const { state } = simulate(strategies.map(toStrategy), seed);
    if (!state.result) throw new Error("The Hunger ended without a result");
    return hungerOutcome(state.result);
  },
};
