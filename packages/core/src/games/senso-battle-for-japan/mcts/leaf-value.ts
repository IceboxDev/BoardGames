import { evaluate, finishRewardsGreedy, lightClone, NO_WEIGHTS } from "../ai-rewards";
import { tierTable } from "../ai-search";
import { buildRewardQueue } from "../game-engine";
import { tierFor } from "../rules";
import type { GameState } from "../types";
import { BOARD_FEATURES, boardFeatures } from "./board-features";
import { EVAL_WEIGHTS } from "./eval-weights";

const TIER_INDEX: Record<number, number> = { 0: 0, 1: 1, 3: 2, 5: 3, 7: 4 };
export const TRICK_TIEBREAK = 0.001;

/**
 * Maps a finished round's trick counts to a per-seat value vector: how each
 * seat's standing (score − best rival, cube tie-break included) changes once
 * the rewards phase those counts earn is played out on the root board.
 *
 * "exact" simulates the phase greedily in the real order with the locks and
 * yields all seats' components from one simulation; "tier" sums the additive
 * per-seat tier tables. Memoised per trick vector — a round has at most a few
 * dozen distinct outcomes, so inside a search the cost is paid once each.
 */
export class LeafValuer {
  private readonly memo = new Map<string, Float64Array>();
  private readonly base: Float64Array;
  private readonly tables: number[][][] | null;
  private readonly learned: boolean;

  constructor(
    private readonly root: GameState,
    mode: "exact" | "tier" | "learned",
  ) {
    const n = root.players.length;
    this.learned = mode === "learned";
    this.base = new Float64Array(n);
    for (let s = 0; s < n; s++) this.base[s] = this.stateValue(root, s);
    this.tables =
      mode === "tier" ? root.players.map((p) => tierTable(root, p.index, NO_WEIGHTS)) : null;
  }

  /** A seat's standing: the current gap, or the learned prediction of the final gap. */
  private stateValue(state: GameState, seat: number): number {
    if (!this.learned) return evaluate(state, seat, NO_WEIGHTS);
    return predictFinalGap(state, seat);
  }

  value(tricksWon: ArrayLike<number>): Float64Array {
    const key = Array.from(tricksWon).join(",");
    const hit = this.memo.get(key);
    if (hit) return hit;
    const v = this.tables ? this.tierValue(tricksWon) : this.exactValue(tricksWon);
    // Shōgun's tie-break: among outcomes with the same rewards, prefer the one
    // where the seat won more tricks (centred so a 2p vector stays antisymmetric).
    const n = v.length;
    let total = 0;
    for (let s = 0; s < n; s++) total += tricksWon[s];
    for (let s = 0; s < n; s++) v[s] += TRICK_TIEBREAK * (tricksWon[s] - total / n);
    this.memo.set(key, v);
    return v;
  }

  private tierValue(tricksWon: ArrayLike<number>): Float64Array {
    const n = this.root.players.length;
    const v = new Float64Array(n);
    const tables = this.tables as number[][][];
    for (let s = 0; s < n; s++) {
      let sum = 0;
      for (let p = 0; p < n; p++) sum += tables[s][p][TIER_INDEX[tierFor(tricksWon[p]) ?? 0] ?? 0];
      v[s] = sum;
    }
    return v;
  }

  private exactValue(tricksWon: ArrayLike<number>): Float64Array {
    const sim = lightClone(this.root);
    sim.players.forEach((p, i) => {
      p.hand = [];
      p.tricksWon = tricksWon[i];
    });
    sim.table = [];
    sim.leadSuit = null;
    sim.completedTrick = null;
    sim.affected = [];
    sim.bonusQueue = [];
    sim.rewardQueue = buildRewardQueue(sim);
    sim.phase = "rewards";
    finishRewardsGreedy(sim);
    const n = this.root.players.length;
    const v = new Float64Array(n);
    for (let s = 0; s < n; s++) v[s] = this.stateValue(sim, s) - this.base[s];
    return v;
  }
}

const FEATURE_SCRATCH = new Float64Array(BOARD_FEATURES);

/** Learned static evaluator: predicted final (own − best rival) score in VP. */
export function predictFinalGap(state: GameState, seat: number): number {
  if (state.phase === "game-over") return evaluate(state, seat, NO_WEIGHTS);
  boardFeatures(state, seat, FEATURE_SCRATCH);
  let v = 0;
  for (let i = 0; i < BOARD_FEATURES; i++) v += EVAL_WEIGHTS[i] * FEATURE_SCRATCH[i];
  return v;
}
