// Features of the learned round-end leaf ("vround", plan Phase 2a).
//
// The live leaf is the additive tier table: value[s] = Σ_p table[s][p][tier_p],
// each cell = how seat s's standing changes when seat p spends a tier-t reward
// greedily and alone on the current board. The learned leaf keeps that
// structure and learns a correction per cell: cell'(s, p, t) = table[s][p][t]
// + net(x_{s,p,t}). This file is the x: perspective-relative (one net serves
// every seat), built from a `RoundView` that both the live root (GameState)
// and the collector's raw rows map onto, so the trainer's Python port
// (scripts/senso-train/vround_features.py) is pinned to it by a fixture.

import { SQUARE_COUNT } from "../map";
import { computeScores, cubesPerSeat } from "../scoring";
import type { GameState } from "../types";
import { MLP_MAX_WIDTH, type MlpModel } from "./mlp";

export const VROUND_SEATS = 5;
export const VROUND_TIERS = 5;
const OWNER_CLASSES = 7; // empty, me, relative seat +1..+4, neutral
const PER_SEAT = 6;
export const VROUND_FEATURES =
  SQUARE_COUNT * OWNER_CLASSES + VROUND_SEATS * PER_SEAT + VROUND_TIERS + 2 + 3 + VROUND_SEATS;

/** What the leaf can see at a round end (board frozen for the decision). */
export interface RoundView {
  n: number;
  round: number;
  /** -1 when no Emperor is seated. */
  emperorSeat: number;
  firstPlayer: number;
  /** Per square, region-major and top-down: owner seat, -1 empty, -2 neutral (unseated clan). */
  squares: Int8Array;
  /** Per seat (Emperor 0). */
  scores: Float32Array;
  cubes: Float32Array;
  supply: Float32Array;
  /** tier[(s * 5 + p) * 5 + t]: the greedy tier table for perspective s, actor p, tier index t. */
  tier: Float32Array;
}

export function roundViewFromState(state: GameState, tier: Float32Array): RoundView {
  const n = state.players.length;
  const seatOfClan = new Map<string, number>();
  for (const p of state.players) if (p.clan !== null) seatOfClan.set(p.clan, p.index);
  const squares = new Int8Array(SQUARE_COUNT);
  let k = 0;
  for (const region of state.board) {
    for (const cube of region) squares[k++] = cube === null ? -1 : (seatOfClan.get(cube) ?? -2);
  }
  const scores = Float32Array.from(computeScores(state));
  const cubes = Float32Array.from(cubesPerSeat(state));
  const supply = new Float32Array(VROUND_SEATS);
  state.players.forEach((p) => {
    supply[p.index] = p.clan === null ? 0 : state.supply[p.clan];
  });
  return {
    n,
    round: state.round,
    emperorSeat: state.emperorSeat ?? -1,
    firstPlayer: state.firstPlayer,
    squares,
    scores: padSeats(scores),
    cubes: padSeats(cubes),
    supply,
    tier,
  };
}

function padSeats(values: Float32Array): Float32Array {
  const out = new Float32Array(VROUND_SEATS);
  out.set(values.subarray(0, VROUND_SEATS));
  return out;
}

/** Index of the greedy cell for (perspective s, actor p, tier index t). */
export function tierIndex(s: number, p: number, t: number): number {
  return (s * VROUND_SEATS + p) * VROUND_TIERS + t;
}

/**
 * Fill `out[0..VROUND_FEATURES)` for perspective seat `s`, actor seat `p`
 * and tier index `t` (0 = no reward, 1..4 = tiers 1/3/5/7).
 */
export function vroundCellFeatures(
  v: RoundView,
  s: number,
  p: number,
  t: number,
  out: Float32Array,
): void {
  const n = v.n;
  out.fill(0, 0, VROUND_FEATURES);
  let k = 0;
  for (let sq = 0; sq < SQUARE_COUNT; sq++) {
    const owner = v.squares[sq];
    let cls: number;
    if (owner === -1) cls = 0;
    else if (owner === -2) cls = 6;
    else cls = 1 + ((owner - s + n) % n);
    out[k + cls] = 1;
    k += OWNER_CLASSES;
  }
  for (let rel = 0; rel < VROUND_SEATS; rel++) {
    const seat = (s + rel) % n;
    const seated = rel < n;
    out[k++] = seated ? v.scores[seat] / 40 : 0;
    out[k++] = seated ? v.cubes[seat] / 8 : 0;
    out[k++] = seated ? v.supply[seat] / 8 : 0;
    out[k++] = seated && seat === v.emperorSeat ? 1 : 0;
    out[k++] = seated ? 1 : 0;
    out[k++] = seated && seat === p ? 1 : 0;
  }
  out[k + t] = 1;
  k += VROUND_TIERS;
  out[k++] = v.tier[tierIndex(s, p, t)] / 10;
  out[k++] = v.tier[tierIndex(p, p, t)] / 10;
  out[k++] = v.round / 8;
  out[k++] = (8 - v.round) / 8;
  out[k++] = n / 5;
  out[k + ((v.firstPlayer - s + n) % n)] = 1;
  k += VROUND_SEATS;
  if (k !== VROUND_FEATURES) throw new Error(`vround features: filled ${k} of ${VROUND_FEATURES}`);
}

/** Column offsets of the collector's raw round rows (collect-value.ts) used to rebuild a view. */
export interface RoundRowColumns {
  index: (name: string) => number;
}

/** Rebuild the view the live root would have produced, from a collector raw row. */
export function roundViewFromRow(row: ArrayLike<number>, at: RoundRowColumns): RoundView {
  const n = row[at.index("n")];
  const squares = new Int8Array(SQUARE_COUNT);
  const sq0 = at.index("square[0]");
  for (let i = 0; i < SQUARE_COUNT; i++) squares[i] = row[sq0 + i];
  const seats = (name: string) => {
    const out = new Float32Array(VROUND_SEATS);
    const base = at.index(`${name}[0]`);
    for (let i = 0; i < VROUND_SEATS; i++) out[i] = row[base + i];
    return out;
  };
  const clan0 = at.index("clan[0]");
  const supply0 = at.index("supply[0]");
  const supply = new Float32Array(VROUND_SEATS);
  for (let seat = 0; seat < n; seat++) {
    const clan = row[clan0 + seat];
    supply[seat] = clan < 0 ? 0 : row[supply0 + clan];
  }
  const tier = new Float32Array(VROUND_SEATS * VROUND_SEATS * VROUND_TIERS);
  const tier0 = at.index("tier[0]");
  for (let i = 0; i < tier.length; i++) tier[i] = row[tier0 + i];
  return {
    n,
    round: row[at.index("round")],
    emperorSeat: row[at.index("emperorSeat")],
    firstPlayer: row[at.index("firstPlayer")],
    squares,
    scores: seats("scoreBefore"),
    cubes: seats("cubesBefore"),
    supply,
    tier,
  };
}

// ---------------------------------------------------------------------------
// Runtime evaluation of the cell net. The first VROUND_BOARD_FEATURES inputs
// (the squares) depend only on the perspective, so their share of the first
// layer is computed once per perspective and reused for every (actor, tier).
// ---------------------------------------------------------------------------

export const VROUND_BOARD_FEATURES = SQUARE_COUNT * OWNER_CLASSES;

export interface VroundScratch {
  x: Float32Array;
  /** Per perspective: first-layer pre-activations of the board part. */
  boardPre: Float32Array[];
  hidden: Float32Array;
  hidden2: Float32Array;
}

export function createVroundScratch(model: MlpModel): VroundScratch {
  const h1 = model.sizes[1];
  return {
    x: new Float32Array(VROUND_FEATURES),
    boardPre: Array.from({ length: VROUND_SEATS }, () => new Float32Array(h1)),
    hidden: new Float32Array(MLP_MAX_WIDTH),
    hidden2: new Float32Array(MLP_MAX_WIDTH),
  };
}

/** Precompute the board share of layer 1 for perspective `s` (call once per perspective). */
export function vroundPrepare(
  model: MlpModel,
  view: RoundView,
  s: number,
  sc: VroundScratch,
): void {
  vroundCellFeatures(view, s, 0, 0, sc.x);
  const w = model.weights[0];
  const cols = model.sizes[0];
  const pre = sc.boardPre[s];
  for (let r = 0; r < model.sizes[1]; r++) {
    let z = model.biases[0][r];
    const base = r * cols;
    for (let c = 0; c < VROUND_BOARD_FEATURES; c++) z += w[base + c] * sc.x[c];
    pre[r] = z;
  }
}

/** The net's correction for cell (s, p, t); `vroundPrepare(s)` must have run. */
export function vroundCellCorrection(
  model: MlpModel,
  view: RoundView,
  s: number,
  p: number,
  t: number,
  sc: VroundScratch,
): number {
  vroundCellFeatures(view, s, p, t, sc.x);
  const w1 = model.weights[0];
  const cols = model.sizes[0];
  const h1 = model.sizes[1];
  const pre = sc.boardPre[s];
  let cur = sc.hidden;
  for (let r = 0; r < h1; r++) {
    let z = pre[r];
    const base = r * cols;
    for (let c = VROUND_BOARD_FEATURES; c < cols; c++) z += w1[base + c] * sc.x[c];
    cur[r] = z > 0 ? z : 0;
  }
  let curLen = h1;
  let next = sc.hidden2;
  for (let l = 1; l < model.weights.length; l++) {
    const rows = model.sizes[l + 1];
    const w = model.weights[l];
    const b = model.biases[l];
    const last = l === model.weights.length - 1;
    for (let r = 0; r < rows; r++) {
      let z = b[r];
      const base = r * curLen;
      for (let c = 0; c < curLen; c++) z += w[base + c] * cur[c];
      next[r] = last || z > 0 ? z : 0;
    }
    const t2 = cur;
    cur = next;
    next = t2;
    curLen = rows;
  }
  return cur[0];
}
