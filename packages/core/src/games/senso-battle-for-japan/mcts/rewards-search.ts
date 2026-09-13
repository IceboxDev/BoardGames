// Rewards-phase search: iterative-deepening max^n over the whole Conflict
// Rewards (and round-4 bonus) phase. Every seat, in the engine's own order,
// picks among its top-w one-ply candidates (plus `pass`) the line whose
// terminal board is best for ITSELF; the leaf is each seat's standing once
// the phase ends. Widths grow 2 → 3 → 4 → 6 → 8 → 10 until the deadline; the
// last completed width decides. Focus picks, the Emperor's `as` choice and
// the bonus cube all fall out of the engine's slot logic.

import { applyLight, evaluate, kindBias, NO_WEIGHTS } from "../ai-rewards";
import { addSearchWork } from "../ai-search";
import { getActivePlayer, getLegalActions } from "../rules";
import { computeScores, cubesPerSeat } from "../scoring";
import type { Action, GameState } from "../types";
import type { TenkaConfig } from "./config";
import { MLP_MAX_WIDTH, type MlpModel, mlpForward } from "./mlp";
import { boardViewFromState, VBOARD_FEATURES, vboardFeatures } from "./vboard-features";
import { vboardModelFor } from "./vboard-models";

/** The engine's own cube credit inside `evalPosition` (ai-rewards.ts). */
const ENGINE_CUBE_WEIGHT = 0.02;

const WIDTHS = [2, 3, 4, 6, 8, 10];
const DEADLINE = Symbol("deadline");

interface Ctx {
  n: number;
  width: number;
  deadline: number;
  tt: Map<string, Float64Array>;
  nodes: number;
  /** VP-equivalent credited per cube on the map (see `TenkaConfig.rewardsCubeWeight`). */
  cubeWeight: number;
  /** Board value blend (see `TenkaConfig.rewardsBoardValue`); null when off. */
  board: BoardBlend | null;
}

interface BoardBlend {
  model: MlpModel;
  lambda: number;
  head: 0 | 1;
  feats: Float32Array;
  out: Float32Array;
  scratch: Float32Array;
}

function boardBlendFor(state: GameState, cfg: TenkaConfig): BoardBlend | null {
  if (cfg.rewardsBoardValue === 0) return null;
  const model = vboardModelFor(state.players.length);
  if (!model) return null;
  return {
    model,
    lambda: cfg.rewardsBoardValue,
    head: cfg.rewardsBoardHead === "win" ? 1 : 0,
    feats: new Float32Array(VBOARD_FEATURES),
    out: new Float32Array(2),
    scratch: new Float32Array(2 * MLP_MAX_WIDTH),
  };
}

/** The board net's chosen head for `seat` on `state` (gap head in VP, win head as a probability). */
function boardValue(state: GameState, seat: number, blend: BoardBlend): number {
  const view = boardViewFromState(state);
  vboardFeatures(view, seat, blend.feats);
  mlpForward(blend.model, blend.feats, blend.out, blend.scratch);
  const raw = blend.out[blend.head];
  return blend.head === 0 ? raw * 10 : 1 / (1 + Math.exp(-raw));
}

/**
 * A seat's standing with a configurable cube credit: score − best rival's
 * score + cubeWeight · (cubes − that rival's cubes). At the engine's 0.02 this
 * is exactly `evaluate(state, seat, NO_WEIGHTS)`.
 */
function standing(
  state: GameState,
  seat: number,
  cubeWeight: number,
  board: BoardBlend | null = null,
): number {
  const base = standingOf(state, seat, cubeWeight);
  return board ? base + board.lambda * boardValue(state, seat, board) : base;
}

function standingOf(state: GameState, seat: number, cubeWeight: number): number {
  if (cubeWeight === ENGINE_CUBE_WEIGHT) return evaluate(state, seat, NO_WEIGHTS);
  const scores = computeScores(state);
  let rival = -1;
  for (let i = 0; i < scores.length; i++) {
    if (i === seat) continue;
    if (rival === -1 || scores[i] > scores[rival]) rival = i;
  }
  if (rival === -1) return scores[seat];
  const cubes = cubesPerSeat(state);
  return scores[seat] - scores[rival] + cubeWeight * (cubes[seat] - cubes[rival]);
}

function stateKey(state: GameState): string {
  let key = `${state.round}|${state.phase}|`;
  for (const squares of state.board) {
    for (const cube of squares) key += cube === null ? "." : cube[0];
    key += "/";
  }
  key += `|${Object.values(state.supply).join(",")}|`;
  for (const slot of state.rewardQueue) {
    key += `${slot.player}${slot.tier}${slot.picksLeft}${slot.used.join("")};`;
  }
  key += "|";
  for (const a of state.affected) key += `${a.region}:${a.by};`;
  key += `|${state.bonusQueue.join(",")}`;
  return key;
}

function inPhase(state: GameState): boolean {
  return state.phase === "rewards" || state.phase === "bonus";
}

function leafVector(
  state: GameState,
  n: number,
  cubeWeight: number,
  board: BoardBlend | null,
): Float64Array {
  const v = new Float64Array(n);
  for (let s = 0; s < n; s++) v[s] = standing(state, s, cubeWeight, board);
  return v;
}

/** Candidates for `seat`, best one-ply first: top-`width` rewards, then `pass` when legal. */
function candidatesFor(
  state: GameState,
  legal: Action[],
  seat: number,
  width: number,
  cubeWeight: number,
  board: BoardBlend | null,
): Action[] {
  const pass = legal.find((a) => a.type === "pass");
  const moves = legal.filter((a): a is Exclude<Action, { type: "pass" }> => a.type !== "pass");
  if (moves.length === 0) return pass ? [pass] : [];
  const base = standing(state, seat, cubeWeight, board);
  const ranked = moves
    .map((action) => ({
      action,
      value:
        standing(applyLight(state, action), seat, cubeWeight, board) -
        base +
        (action.type === "play" || action.type === "bonus-place" ? 0 : kindBias(action)) -
        ("region" in action ? action.region * 1e-4 : 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, width)
    .map((r): Action => r.action);
  if (pass) ranked.push(pass);
  return ranked;
}

function maxn(state: GameState, ctx: Ctx): Float64Array {
  if (!inPhase(state)) return leafVector(state, ctx.n, ctx.cubeWeight, ctx.board);
  if (ctx.nodes++ % 32 === 31 && performance.now() > ctx.deadline) throw DEADLINE;
  const key = stateKey(state);
  const hit = ctx.tt.get(key);
  if (hit) return hit;
  const seat = getActivePlayer(state);
  const legal = getLegalActions(state);
  const candidates = candidatesFor(state, legal, seat, ctx.width, ctx.cubeWeight, ctx.board);
  if (candidates.length === 0) return leafVector(state, ctx.n, ctx.cubeWeight, ctx.board);
  let best: Float64Array | null = null;
  for (const action of candidates) {
    const v = maxn(applyLight(state, action), ctx);
    if (best === null || v[seat] > best[seat] + 1e-9) best = v;
  }
  const result = best ?? leafVector(state, ctx.n, ctx.cubeWeight, ctx.board);
  ctx.tt.set(key, result);
  return result;
}

function searchRoot(
  state: GameState,
  legal: Action[],
  seat: number,
  cfg: TenkaConfig,
): { action: Action; width: number; nodes: number } | null {
  const n = state.players.length;
  const timed = cfg.rewardTimeMs > 0;
  const deadline = timed ? performance.now() + cfg.rewardTimeMs : Number.POSITIVE_INFINITY;
  const widths = timed
    ? WIDTHS.filter((w) => w <= cfg.rewardWidth)
    : [Math.min(cfg.rewardWidth, WIDTHS[WIDTHS.length - 1])];
  if (widths.length === 0) widths.push(cfg.rewardWidth);
  let chosen: { action: Action; width: number; nodes: number } | null = null;
  let totalNodes = 0;
  const board = boardBlendFor(state, cfg);
  for (const width of widths) {
    const ctx: Ctx = {
      n,
      width,
      deadline,
      tt: new Map(),
      nodes: 0,
      cubeWeight: cfg.rewardsCubeWeight,
      board,
    };
    const candidates = candidatesFor(state, legal, seat, width, cfg.rewardsCubeWeight, board);
    if (candidates.length === 0) break;
    if (candidates.length === 1) {
      chosen = { action: candidates[0], width, nodes: 0 };
      break;
    }
    try {
      let best: { action: Action; value: number } | null = null;
      for (const action of candidates) {
        const v = maxn(applyLight(state, action), ctx);
        if (best === null || v[seat] > best.value + 1e-9) best = { action, value: v[seat] };
      }
      if (best) chosen = { action: best.action, width, nodes: ctx.nodes };
      totalNodes += ctx.nodes;
    } catch (error) {
      if (error !== DEADLINE) throw error;
      totalNodes += ctx.nodes;
      break;
    }
    // A width that exhausted every candidate at every node cannot change with more width.
    if (candidates.length < width + 1 && ctx.nodes < width) break;
  }
  addSearchWork(totalNodes);
  return chosen;
}

export function pickRewardTenka(
  state: GameState,
  legal: Action[],
  seat: number,
  cfg: TenkaConfig,
): Action {
  const pass = legal.find((a) => a.type === "pass");
  if (legal.length === 1) return legal[0];
  const result = searchRoot(state, legal, seat, cfg);
  return (
    result?.action ??
    candidatesFor(state, legal, seat, 1, cfg.rewardsCubeWeight, null)[0] ??
    pass ??
    legal[0]
  );
}

export function pickBonusTenka(
  state: GameState,
  legal: Action[],
  seat: number,
  cfg: TenkaConfig,
): Action {
  if (legal.length === 1) return legal[0];
  const result = searchRoot(state, legal, seat, cfg);
  return (
    result?.action ??
    candidatesFor(state, legal, seat, 1, cfg.rewardsCubeWeight, null)[0] ??
    legal[0]
  );
}
