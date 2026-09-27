import { strategyGuard } from "../../machines/seats";
import type { TournamentSimulator } from "../../tournament/simulator";
import { pickAiActionTimed } from "./ai-strategies";
import { applyAction, createInitialState, settleTrick } from "./game-engine";
import { sensoOutcome } from "./outcome";
import { getActivePlayer } from "./rules";
import {
  AI_STRATEGY_LABELS,
  type AIStrategyId,
  type AiBudget,
  type Phase,
  type SensoResult,
} from "./types";

// 8 rounds × ≤13 tricks × ≤5 plays + settles + rewards — a few thousand steps at most.
const MAX_GAME_STEPS = 5000;

export function seedForGame(gameIndex: number): number {
  return (Math.imul(gameIndex + 1, 0x9e3779b1) ^ 0x5e750) >>> 0;
}

export interface DecisionTiming {
  n: number;
  sum: number;
  max: number;
  /** Raw ms per decision when `keepSamples` was requested. */
  samples: number[];
  iterations: number;
}

export interface DetailedGame {
  winner: number;
  scores: number[];
  /** The engine's final result; `null` only if the step cap cut the game short. */
  result: SensoResult | null;
  decisions: number;
  /** Per strategy id. */
  ms: Record<string, DecisionTiming>;
}

export interface SimulateOptions {
  budget?: AiBudget;
  keepSamples?: boolean;
  /** Deal seed override (default `seedForGame(gameIndex)`) — mirrored benches replay a seed with the seats swapped. */
  seed?: number;
  /** Called after every AI decision (the bench aggregates per phase). */
  onDecision?: (
    seat: number,
    strategy: string,
    phase: Phase,
    ms: number,
    iterations: number,
  ) => void;
}

/**
 * Simulate one all-AI game headlessly (no XState, no log) and time every
 * decision. Seeded by the game index so a run is reproducible.
 */
export function simulateGameDetailed(
  strategies: readonly AIStrategyId[],
  gameIndex: number,
  opts: SimulateOptions = {},
): DetailedGame {
  const seed = opts.seed ?? seedForGame(gameIndex);
  const state = createInitialState(strategies.length, strategies, seed, { log: false });
  const ms: Record<string, DecisionTiming> = {};
  let decisions = 0;

  let steps = 0;
  while (state.phase !== "game-over" && steps < MAX_GAME_STEPS) {
    if (state.phase === "trick-settle") {
      settleTrick(state);
    } else {
      const seat = getActivePlayer(state);
      const strategy = strategies[seat];
      const phase = state.phase;
      const timed = pickAiActionTimed(state, seat, strategy, opts.budget);
      const bucket = ms[strategy] ?? { n: 0, sum: 0, max: 0, samples: [], iterations: 0 };
      ms[strategy] = bucket;
      bucket.n++;
      bucket.sum += timed.ms;
      bucket.iterations += timed.iterations;
      if (timed.ms > bucket.max) bucket.max = timed.ms;
      if (opts.keepSamples) bucket.samples.push(timed.ms);
      opts.onDecision?.(seat, strategy, phase, timed.ms, timed.iterations);
      decisions++;
      applyAction(state, timed.action);
    }
    steps++;
  }
  return {
    winner: state.result?.winner ?? -1,
    scores: state.result?.scores ?? [],
    result: state.result,
    decisions,
    ms,
  };
}

/** Winning seat, or -1 for an unbreakable draw. */
export function simulateGame(strategies: AIStrategyId[], gameIndex: number): number {
  return simulateGameDetailed(strategies, gameIndex).winner;
}

/**
 * Seats for a two-strategy matchup at any table size: A,B,A,B… on even game
 * indices and B,A,B,A… on odd ones, so over an even number of games each
 * strategy sits in every seat (and holds the odd extra seat) equally often.
 */
export function seatPattern<T>(a: T, b: T, playerCount: number, gameIndex: number): T[] {
  return Array.from({ length: playerCount }, (_, i) => ((i + gameIndex) % 2 === 0 ? a : b));
}

const toStrategy = strategyGuard("Sensō", AI_STRATEGY_LABELS);

export const sensoSimulator: TournamentSimulator = {
  playerCounts: [2, 3, 4, 5],

  simulate({ strategies, seed }) {
    const { result } = simulateGameDetailed(strategies.map(toStrategy), 0, { seed });
    if (!result) throw new Error(`Sensō did not finish in ${MAX_GAME_STEPS} steps`);
    return sensoOutcome(result);
  },
};
