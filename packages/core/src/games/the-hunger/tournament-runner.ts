import { simulate } from "./simulate";
import type { AIStrategyId, GameOptions, Mode } from "./types";

// Headless AI-vs-AI games for the server's tournament workers. Seeded by the
// game index, so a run is reproducible; seats follow `seatPattern` so both
// strategies hold every chair equally often.

export function seedForGame(gameIndex: number): number {
  return (Math.imul(gameIndex + 1, 0x9e3779b1) ^ 0x4a11) >>> 0;
}

/**
 * Seats for a two-strategy matchup at any table size: A,B,A,B… on even game
 * indices and B,A,B,A… on odd ones.
 */
export function seatPattern<T>(a: T, b: T, playerCount: number, gameIndex: number): T[] {
  return Array.from({ length: playerCount }, (_, i) => ((i + gameIndex) % 2 === 0 ? a : b));
}

export interface HungerGameOutcome {
  /** Winning seat, or -1 for a shared win or a game that failed to finish. */
  winner: number;
  scores: number[];
}

export function simulateGame(
  strategies: AIStrategyId[],
  gameIndex: number,
  options: { mode?: Mode; seed?: number } = {},
): HungerGameOutcome {
  const gameOptions: Partial<GameOptions> = options.mode ? { mode: options.mode } : {};
  try {
    const { state } = simulate(strategies, options.seed ?? seedForGame(gameIndex), gameOptions);
    return { winner: state.result?.winner ?? -1, scores: state.result?.scores ?? [] };
  } catch {
    // A stuck game counts as a draw rather than aborting the whole tournament.
    return { winner: -1, scores: [] };
  }
}

/** Mean score of the seats each strategy held (0 when it held none). */
export function meanScoreBySide<T>(
  seats: readonly T[],
  scores: readonly number[],
  side: T,
): number {
  let sum = 0;
  let n = 0;
  seats.forEach((s, i) => {
    if (s === side && scores[i] !== undefined) {
      sum += scores[i];
      n++;
    }
  });
  return n === 0 ? 0 : sum / n;
}
