import { evaluate, finishRewardsGreedy, lightClone, NO_WEIGHTS } from "../ai-rewards";
import { tierTable } from "../ai-search";
import { buildRewardQueue } from "../game-engine";
import { tierFor } from "../rules";
import type { GameState } from "../types";
import { BOARD_FEATURES, boardFeatures } from "./board-features";
import { EVAL_WEIGHTS } from "./eval-weights";
import {
  createVroundScratch,
  roundViewFromState,
  tierIndex,
  VROUND_SEATS,
  VROUND_TIERS,
  vroundCellCorrection,
  vroundPrepare,
} from "./vround-features";
import { vroundModelFor } from "./vround-models";

const TIER_INDEX: Record<number, number> = { 0: 0, 1: 1, 3: 2, 5: 3, 7: 4 };
export const TRICK_TIEBREAK = 0.001;

export type LeafMode = "exact" | "tier" | "learned" | "vround";

/**
 * Maps a finished round's trick counts to a per-seat value vector: how each
 * seat's standing (score − best rival, cube tie-break included) changes once
 * the rewards phase those counts earn is played out on the root board.
 *
 * "exact" simulates the phase greedily in the real order with the locks and
 * yields all seats' components from one simulation; "tier" sums the additive
 * per-seat tier tables; "vround" keeps that structure with each cell corrected
 * by the learned net (vround-features.ts; the plain table where no net is
 * trained for the table size). Memoised per trick vector — a round has at
 * most a few dozen distinct outcomes, so inside a search the cost is paid
 * once each.
 */
export class LeafValuer {
  private readonly memo = new Map<string, Float64Array>();
  private readonly base: Float64Array;
  private readonly tables: number[][][] | null;
  private readonly learned: boolean;

  constructor(
    private readonly root: GameState,
    mode: LeafMode,
  ) {
    const n = root.players.length;
    this.learned = mode === "learned";
    this.base = new Float64Array(n);
    for (let s = 0; s < n; s++) this.base[s] = this.stateValue(root, s);
    this.tables =
      mode === "tier" || mode === "vround"
        ? root.players.map((p) => tierTable(root, p.index, NO_WEIGHTS))
        : null;
    if (mode === "vround" && this.tables) {
      // `tierTable` returns cached arrays shared with Shōgun's search: copy before correcting.
      this.tables = this.tables.map((table) => table.map((row) => [...row]));
      this.correctCells(this.tables);
    }
  }

  /** Replace each greedy cell by greedy + net correction (the "vround" leaf). */
  private correctCells(tables: number[][][]): void {
    const n = this.root.players.length;
    const model = vroundModelFor(n);
    if (!model) return;
    const tier = new Float32Array(VROUND_SEATS * VROUND_SEATS * VROUND_TIERS);
    for (let s = 0; s < n; s++) {
      for (let p = 0; p < n; p++) {
        for (let t = 0; t < VROUND_TIERS; t++) tier[tierIndex(s, p, t)] = tables[s][p][t];
      }
    }
    const view = roundViewFromState(this.root, tier);
    const scratch = createVroundScratch(model);
    for (let s = 0; s < n; s++) {
      vroundPrepare(model, view, s, scratch);
      for (let p = 0; p < n; p++) {
        // A seat without a reward (tier index 0) contributes nothing, as in the table.
        for (let t = 1; t < VROUND_TIERS; t++) {
          tables[s][p][t] += vroundCellCorrection(model, view, s, p, t, scratch);
        }
      }
    }
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

  /**
   * Expected leaf under a per-seat tier distribution `probs[(seat * 5) + t]`
   * (the expected-tier net's output for one dealt world): Σ_p Σ_t P_p(t) ·
   * cell[s][p][t], plus the trick tie-break on the tricks banked so far.
   * Only defined for the table-based modes ("tier", "vround").
   */
  expected(probs: Float32Array, tricksWon: ArrayLike<number>): Float64Array {
    const tables = this.tables;
    if (!tables) throw new Error("expected leaf needs a table-based leaf mode");
    const n = this.root.players.length;
    const v = new Float64Array(n);
    let total = 0;
    for (let s = 0; s < n; s++) total += tricksWon[s];
    for (let s = 0; s < n; s++) {
      let sum = 0;
      for (let p = 0; p < n; p++) {
        const row = tables[s][p];
        for (let t = 1; t < 5; t++) sum += probs[p * 5 + t] * row[t];
      }
      v[s] = sum + TRICK_TIEBREAK * (tricksWon[s] - total / n);
    }
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
