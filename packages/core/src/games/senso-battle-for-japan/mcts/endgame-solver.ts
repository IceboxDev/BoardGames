// Exact max^n over the rest of a (determinized) round with in-place apply /
// undo. Each seat maximises its own component of the leaf vector; ties go to
// the lower card so the result is deterministic. Positions are keyed at trick
// boundaries in canonical relative-rank form (dd-canon.ts), so equivalent
// positions from different deals share entries.
//
// Two players are special: the leaf is monotone in the leader's trick count
// (a higher tier is a superset of reward options, `pass` is always legal, and
// the tie-break term rises with tricks), so max^n on the leaf equals minimax
// on tricks. That value is board-independent, so it lives in a process-wide
// memo — every 2p endgame ever solved warms every later one.

import type { Rng } from "../../../lib/rng";
import { canonicalKey, positionKey } from "./dd-canon";
import {
  applyFast,
  cloneFast,
  type FastRound,
  legalInto,
  N_CARDS,
  type RootInfo,
  redeterminize,
  resetFrom,
  strengthOf,
  undoFast,
} from "./fast-round";
import type { LeafValuer } from "./leaf-value";

const MAX_DEPTH = 70;
const BUFS: Int8Array[] = Array.from({ length: MAX_DEPTH }, () => new Int8Array(13));

// ---------------------------------------------------------------------------
// Two-player trick minimax with a process-wide memo
// ---------------------------------------------------------------------------

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
/** Bound flag in the low 2 bits, seat-0 future tricks above. */
const TRICK_MEMO = new Map<string, number>();
const TRICK_MEMO_MAX = 2_000_000;
let trickMemoHits = 0;
let trickMemoMisses = 0;

export function trickMemoStats(): { size: number; hits: number; misses: number } {
  return { size: TRICK_MEMO.size, hits: trickMemoHits, misses: trickMemoMisses };
}

export function clearTrickMemo(): void {
  TRICK_MEMO.clear();
  trickMemoHits = 0;
  trickMemoMisses = 0;
}

/**
 * Future tricks seat 0 can force from `f` (two players; seat 0 maximises,
 * seat 1 minimises). Fail-soft alpha-beta; boundary positions are memoised
 * with exact / lower / upper flags.
 */
export function solveTricks2p(f: FastRound, alpha = 0, beta = 14, depth = 0): number {
  if (f.cardsLeft === 0) return 0;
  const boundary = f.tableLen === 0;
  let key = "";
  const alpha0 = alpha;
  const beta0 = beta;
  if (boundary) {
    key = positionKey(f);
    const entry = TRICK_MEMO.get(key);
    if (entry !== undefined) {
      const v = entry >> 2;
      const flag = entry & 3;
      if (flag === EXACT || (flag === LOWER && v >= beta) || (flag === UPPER && v <= alpha)) {
        trickMemoHits++;
        return v;
      }
    }
    trickMemoMisses++;
  }
  const seat = f.turn;
  const buf = BUFS[depth];
  const count = legalInto(f, seat, buf);
  const before = f.tricksWon[0];
  let best = seat === 0 ? -1 : 99;
  for (let i = 0; i < count; i++) {
    applyFast(f, buf[i]);
    const won = f.tricksWon[0] - before;
    const v = won + solveTricks2p(f, alpha - won, beta - won, depth + 1);
    undoFast(f);
    if (seat === 0) {
      if (v > best) best = v;
      if (v > alpha) alpha = v;
    } else {
      if (v < best) best = v;
      if (v < beta) beta = v;
    }
    if (alpha >= beta) break;
  }
  if (boundary) {
    const flag = best <= alpha0 ? UPPER : best >= beta0 ? LOWER : EXACT;
    if (TRICK_MEMO.size >= TRICK_MEMO_MAX) TRICK_MEMO.clear();
    TRICK_MEMO.set(key, (best << 2) | flag);
  }
  return best;
}

export function solveExact(
  f: FastRound,
  leaf: LeafValuer,
  tt: Map<string, Float64Array>,
  depth = 0,
): Float64Array {
  if (f.cardsLeft === 0) return leaf.value(f.tricksWon);
  if (f.n === 2) {
    // Trick minimax is exact for the monotone 2p leaf and board-independent.
    const future = solveTricks2p(f, 0, f.cardsLeft, depth);
    const total = f.tricksWon[0] + f.tricksWon[1] + f.cardsLeft / 2;
    const t0 = f.tricksWon[0] + future;
    return leaf.value([t0, total - t0]);
  }
  const boundary = f.tableLen === 0;
  let key = "";
  if (boundary) {
    key = canonicalKey(f);
    const hit = tt.get(key);
    if (hit) return hit;
  }
  const seat = f.turn;
  const buf = BUFS[depth];
  const count = legalInto(f, seat, buf);
  let best: Float64Array | null = null;
  let bestCard = -1;
  for (let i = 0; i < count; i++) {
    const card = buf[i];
    applyFast(f, card);
    const v = solveExact(f, leaf, tt, depth + 1);
    undoFast(f);
    if (
      best === null ||
      v[seat] > best[seat] + 1e-12 ||
      (Math.abs(v[seat] - best[seat]) <= 1e-12 &&
        strengthOf(card, f.trump) < strengthOf(bestCard, f.trump))
    ) {
      best = v;
      bestCard = card;
    }
  }
  const result = best ?? leaf.value(f.tricksWon);
  if (boundary) tt.set(key, result);
  return result;
}

/**
 * Root exact-PIMC: for each sampled world solve the round exactly for every
 * candidate card; play the card with the best mean value for `me`.
 */
export function solveRootPimc(
  root: RootInfo,
  candidates: readonly number[],
  dets: number,
  rng: Rng,
  leaf: LeafValuer,
  deadline = Number.POSITIVE_INFINITY,
  minDets = 4,
  /** Optional deal weight (log scale) — likelihood-weighted PIMC. */
  logWeight?: (f: FastRound) => number,
): { card: number; totals: Map<number, number>; dets: number } {
  const f = cloneFast(root.base);
  const scratch = new Int8Array(N_CARDS);
  const totals = new Map<number, number>();
  for (const c of candidates) totals.set(c, 0);
  let d = 0;
  let maxLog = Number.NEGATIVE_INFINITY;
  let sumW = 0;
  for (; d < dets; d++) {
    if (d >= minDets && performance.now() > deadline) break;
    resetFrom(f, root.base);
    if (root.unseen.length > 0) redeterminize(f, root, rng, scratch);
    let w = 1;
    if (logWeight) {
      const logw = logWeight(f);
      if (logw > maxLog) {
        const scale = Number.isFinite(maxLog) ? Math.exp(maxLog - logw) : 0;
        for (const c of candidates) totals.set(c, (totals.get(c) ?? 0) * scale);
        sumW *= scale;
        maxLog = logw;
      }
      w = Math.exp(logw - maxLog);
    }
    sumW += w;
    const tt = new Map<string, Float64Array>();
    for (const card of candidates) {
      applyFast(f, card);
      const v = solveExact(f, leaf, tt);
      undoFast(f);
      totals.set(card, (totals.get(card) ?? 0) + w * v[root.me]);
    }
  }
  if (sumW > 0) for (const c of candidates) totals.set(c, (totals.get(c) ?? 0) / sumW);
  let best = candidates[0];
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const card of candidates) {
    const value = (totals.get(card) ?? 0) - strengthOf(card, f.trump) * 1e-4;
    if (value > bestValue) {
      bestValue = value;
      best = card;
    }
  }
  return { card: best, totals, dets: d };
}
