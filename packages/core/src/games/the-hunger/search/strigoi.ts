import { heuristicPick } from "../ai-heuristic";
import { applyUnchecked } from "../game-engine";
import type { Action, GameState } from "../types";
import { determinize, mulberry32, type Rand } from "./determinize";
import { outcomeUtility, playout } from "./rollout";

// Strigoi: determinized Monte Carlo over the current decision's legal moves.
// Each rollout samples a world consistent with the seat's view, applies the
// candidate, and plays to sunrise with Nosferatu for everyone. Candidates
// share worlds within a round (common random numbers), and the budget is
// spent by sequential halving — the Gumbel-root allocation without a prior —
// so most rollouts go to the moves that are still in contention.

export interface StrigoiConfig {
  /** Rollouts per decision when `timeMs` is 0 (reproducible benches). */
  rollouts: number;
  /** Fewest rollouts any arm gets before a halving cut. */
  minPerArm: number;
  /** Wall-clock budget per decision; 0 = use `rollouts`. */
  timeMs: number;
}

export const DEFAULT_STRIGOI: StrigoiConfig = { rollouts: 96, minPerArm: 4, timeMs: 0 };

interface Arm {
  action: Action;
  sum: number;
  n: number;
}

function seedOf(state: GameState, seat: number): number {
  // Deterministic per position so benches replay; independent of hidden cards.
  return (Math.imul(state.turn * 131 + seat * 17 + state.placeCounter, 0x9e3779b1) ^ 0x5717) >>> 0;
}

export function strigoiPick(
  state: GameState,
  seat: number,
  legal: readonly Action[],
  cfg: StrigoiConfig = DEFAULT_STRIGOI,
): Action {
  if (legal.length === 1) return legal[0];
  const rand: Rand = mulberry32(seedOf(state, seat));
  const deadline = cfg.timeMs > 0 ? performance.now() + cfg.timeMs : Number.POSITIVE_INFINITY;
  const budget = cfg.timeMs > 0 ? Number.POSITIVE_INFINITY : cfg.rollouts;

  let arms: Arm[] = legal.map((action) => ({ action, sum: 0, n: 0 }));
  const rounds = Math.max(1, Math.ceil(Math.log2(arms.length)));
  const perRound = cfg.timeMs > 0 ? 0 : Math.max(arms.length, Math.floor(budget / rounds));

  for (let round = 0; round < rounds && arms.length > 1; round++) {
    const each =
      cfg.timeMs > 0
        ? Number.POSITIVE_INFINITY
        : Math.max(cfg.minPerArm, Math.floor(perRound / arms.length));
    for (let k = 0; k < each; k++) {
      if (performance.now() > deadline) break;
      const world = determinize(state, seat, rand);
      for (const arm of arms) {
        const end = playout(applyUnchecked(world, seat, arm.action));
        arm.sum += outcomeUtility(end, seat);
        arm.n++;
      }
      // Time mode: spread the remaining time evenly over the remaining rounds.
      if (
        cfg.timeMs > 0 &&
        performance.now() > deadline - ((rounds - round - 1) * cfg.timeMs) / rounds
      )
        break;
    }
    if (arms.every((a) => a.n === 0)) break;
    arms.sort((a, b) => b.sum / Math.max(1, b.n) - a.sum / Math.max(1, a.n));
    arms = arms.slice(0, Math.max(1, Math.ceil(arms.length / 2)));
  }
  if (arms[0].n === 0) return heuristicPick(state, seat, legal);
  return arms[0].action;
}
