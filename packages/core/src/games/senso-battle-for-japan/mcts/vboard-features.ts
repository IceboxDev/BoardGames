// Features of the board value net (plan Phase 2b / Track B2): from a board
// between rounds (or a leaf of the rewards-phase search) predict, per
// perspective seat, the final standing — a rank-aware, future-aware objective
// where the engine's `evalPosition` is myopic. Perspective-relative like the
// round-end leaf; shares the square encoding of vround-features.ts.

import { SQUARE_COUNT } from "../map";
import { computeScores, cubesPerSeat } from "../scoring";
import type { GameState } from "../types";
import { type RoundView, VROUND_SEATS } from "./vround-features";

const OWNER_CLASSES = 7;
const PER_SEAT = 5;
export const VBOARD_FEATURES =
  SQUARE_COUNT * OWNER_CLASSES + VROUND_SEATS * PER_SEAT + 3 + VROUND_SEATS;

/** The board-only view of a state (no tier table). */
export function boardViewFromState(state: GameState): RoundView {
  const n = state.players.length;
  const seatOfClan = new Map<string, number>();
  for (const p of state.players) if (p.clan !== null) seatOfClan.set(p.clan, p.index);
  const squares = new Int8Array(SQUARE_COUNT);
  let k = 0;
  for (const region of state.board) {
    for (const cube of region) squares[k++] = cube === null ? -1 : (seatOfClan.get(cube) ?? -2);
  }
  const scores = new Float32Array(VROUND_SEATS);
  const cubes = new Float32Array(VROUND_SEATS);
  const supply = new Float32Array(VROUND_SEATS);
  computeScores(state).forEach((v, s) => {
    scores[s] = v;
  });
  cubesPerSeat(state).forEach((v, s) => {
    cubes[s] = v;
  });
  state.players.forEach((p) => {
    supply[p.index] = p.clan === null ? 0 : state.supply[p.clan];
  });
  return {
    n,
    round: state.round,
    emperorSeat: state.emperorSeat ?? -1,
    firstPlayer: state.firstPlayer,
    squares,
    scores,
    cubes,
    supply,
    tier: new Float32Array(0),
  };
}

/** Fill `out[0..VBOARD_FEATURES)` for perspective seat `s`. */
export function vboardFeatures(v: RoundView, s: number, out: Float32Array): void {
  const n = v.n;
  out.fill(0, 0, VBOARD_FEATURES);
  let k = 0;
  for (let sq = 0; sq < SQUARE_COUNT; sq++) {
    const owner = v.squares[sq];
    const cls = owner === -1 ? 0 : owner === -2 ? 6 : 1 + ((owner - s + n) % n);
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
  }
  out[k++] = v.round / 8;
  out[k++] = (8 - v.round) / 8;
  out[k++] = n / 5;
  out[k + ((v.firstPlayer - s + n) % n)] = 1;
  k += VROUND_SEATS;
  if (k !== VBOARD_FEATURES) throw new Error(`vboard features: filled ${k} of ${VBOARD_FEATURES}`);
}
