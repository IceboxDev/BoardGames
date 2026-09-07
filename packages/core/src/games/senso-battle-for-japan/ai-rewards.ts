import type { Mode } from "./ai-tricks";
import { applyActionTrusted } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import { computeScores, cubesPerSeat } from "./scoring";
import type { Action, GameState, RewardAction } from "./types";
import { isRewardAction } from "./types";

// ---------------------------------------------------------------------------
// Cheap state copies for search. `structuredClone` of a whole GameState drags
// the public log along (hundreds of entries by round 8); a rollout only needs
// the parts a move can touch.
// ---------------------------------------------------------------------------

/** Copy everything an action can mutate, share the rest, drop the log. */
export function lightClone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    board: state.board.map((squares) => [...squares]),
    supply: { ...state.supply },
    advantageRow: [...state.advantageRow],
    table: state.table.map((p) => ({ ...p })),
    played: [...state.played],
    tricks: [...state.tricks],
    rewardQueue: state.rewardQueue.map((slot) => ({ ...slot, used: [...slot.used] })),
    affected: state.affected.map((a) => ({ ...a })),
    bonusQueue: [...state.bonusQueue],
    log: [],
    logEnabled: false,
    result: null,
  };
}

/** `action` must be one of `getLegalActions(state)`'s own objects. */
export function applyLight(state: GameState, action: Action): GameState {
  const next = lightClone(state);
  applyActionTrusted(next, action);
  return next;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * My score minus the best opponent's — Emperor-aware because `computeScores`
 * is — plus the rulebook's tie-break as a strictly smaller term: a tie is
 * decided by cubes on the map, so between equal scores the position with the
 * cube edge over the top rival is the better one (scores are integers, so
 * ±0.02 per cube can never outrank a point).
 */
export function evalPosition(state: GameState, seat: number): number {
  const scores = computeScores(state);
  let rival = -1;
  for (let i = 0; i < scores.length; i++) {
    if (i === seat) continue;
    if (rival === -1 || scores[i] > scores[rival]) rival = i;
  }
  if (rival === -1) return scores[seat];
  const cubes = cubesPerSeat(state);
  return scores[seat] - scores[rival] + TIEBREAK_PER_CUBE * (cubes[seat] - cubes[rival]);
}

const TIEBREAK_PER_CUBE = 0.02;

/** Positional terms the raw score cannot see; all in VP-equivalents. */
export interface EvalWeights {
  /** Per own cube on the map — the tie-break, and a cube is future Control. */
  cube: number;
  /** Per own cube with an opponent cube directly below it (it can be swapped down). */
  exposure: number;
  /** Per region where I hold exactly one cube and a square is still empty (Control within reach). */
  potential: number;
}

export const NO_WEIGHTS: EvalWeights = { cube: 0, exposure: 0, potential: 0 };

/** `evalPosition` plus weighted positional terms for a clan seat (the Emperor has no cubes). */
export function evaluate(state: GameState, seat: number, w: EvalWeights): number {
  let value = evalPosition(state, seat);
  const clan = state.players[seat]?.clan ?? null;
  if (clan === null || (w.cube === 0 && w.exposure === 0 && w.potential === 0)) return value;
  for (const squares of state.board) {
    let mine = 0;
    let empty = false;
    for (let i = 0; i < squares.length; i++) {
      const cube = squares[i];
      if (cube === null) {
        empty = true;
        continue;
      }
      if (cube !== clan) continue;
      mine++;
      value += w.cube;
      const below = squares[i + 1];
      if (below !== undefined && below !== null && below !== clan) value -= w.exposure;
    }
    if (mine === 1 && empty) value += w.potential;
  }
  return value;
}

export function kindBias(action: RewardAction): number {
  switch (action.type) {
    case "aggression":
      return 0.03;
    case "determination":
      return 0.02;
    default:
      return 0.01;
  }
}

function leaderSeat(state: GameState, seat: number): number {
  const scores = computeScores(state);
  let best = -1;
  for (let i = 0; i < scores.length; i++) {
    if (i === seat) continue;
    if (best === -1 || scores[i] > scores[best]) best = i;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Greedy one-ply picks (the Daimyō / Warlord policy, and the search's model
// of what everyone else does)
// ---------------------------------------------------------------------------

export function pickReward(state: GameState, legal: Action[], seat: number, mode: Mode): Action {
  const pass = legal.find((a) => a.type === "pass");
  const options = legal.filter(isRewardAction);
  if (options.length === 0) return pass ?? legal[0];

  const base = evalPosition(state, seat);
  const leader = mode === "aggressive" ? leaderSeat(state, seat) : -1;
  const leaderClan = leader >= 0 ? state.players[leader].clan : null;

  let best: { action: RewardAction; value: number; delta: number } | null = null;
  for (const action of options) {
    const delta = evalPosition(applyLight(state, action), seat) - base;
    let value = delta + kindBias(action) - action.region * 0.0001;
    if (
      mode === "aggressive" &&
      action.type === "aggression" &&
      leaderClan !== null &&
      state.board[action.region][action.square] === leaderClan
    ) {
      value += 0.5;
    }
    if (best === null || value > best.value) best = { action, value, delta };
  }
  if (best === null) return pass ?? legal[0];
  const threshold = mode === "aggressive" ? 0 : Number.EPSILON;
  if (best.delta < threshold && pass) return pass;
  return best.action;
}

export function pickBonus(state: GameState, legal: Action[], seat: number): Action {
  const options = legal.filter(
    (a): a is Extract<Action, { type: "bonus-place" }> => a.type === "bonus-place",
  );
  if (options.length === 0) return legal[0];
  const base = evalPosition(state, seat);
  let best: { action: Action; value: number } | null = null;
  for (const action of options) {
    const value = evalPosition(applyLight(state, action), seat) - base - action.region * 0.0001;
    if (best === null || value > best.value) best = { action, value };
  }
  return best?.action ?? legal[0];
}

/** Play out the rest of the rewards (and a round-4 bonus) with greedy picks. Mutates. */
export function finishRewardsGreedy(state: GameState, mode: Mode = "careful"): void {
  for (let guard = 0; guard < 40; guard++) {
    if (state.phase !== "rewards" && state.phase !== "bonus") return;
    const seat = getActivePlayer(state);
    const legal = getLegalActions(state);
    if (legal.length === 0) return;
    const action =
      state.phase === "rewards"
        ? pickReward(state, legal, seat, mode)
        : pickBonus(state, legal, seat);
    applyActionTrusted(state, action);
  }
}
