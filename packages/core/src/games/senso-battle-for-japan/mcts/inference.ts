// Likelihood of a determinization. A sampled deal is only as plausible as the
// plays the other seats made with it: replay this round's history in the
// sampled world and score each opponent decision by the softmax probability
// the learned policy gives the card actually played.
//
// The likelihood is SEPARABLE BY SEAT: every feature in `policyFeatures` reads
// a card only as "mine / played / unseen", so an opponent's decision terms
// depend on its own hand and the public cards alone. `worldLogWeight` is the
// sum of `seatLogWeight` over the opponents (pinned by inference.test.ts), and
// the posterior deal sampler (deal-sampler.ts) recomputes only the seats a
// proposal touched.
//
// Voids are tracked incrementally during the replay, so each replayed decision
// sees exactly the voids that were public when it was made — the same view
// collect-policy.ts recorded when the model was fitted. (`fixedVoids` on the
// scratch replays every decision under one mask instead — the root's final
// mask, the behaviour before 2026-09-13 — for A/B runs.)

import { RULINGS } from "../rulings";
import type { GameState } from "../types";
import {
  applyFast,
  CARD_INDEX,
  CARD_SUIT,
  cloneFast,
  type FastRound,
  legalInto,
  N_CARDS,
  PLAYED,
} from "./fast-round";
import { FEATURES, MAX_HIDDEN, type PolicyModel, policyFeatures, scoreCards } from "./policy";

export interface RoundHistory {
  /** (seat, card) pairs in play order. */
  plays: Int16Array;
  count: number;
  firstLeader: number;
}

export function roundHistory(state: GameState): RoundHistory {
  const pairs: number[] = [];
  for (const trick of state.tricks) {
    for (const play of trick.plays) pairs.push(play.seat, CARD_INDEX[play.card]);
  }
  for (const play of state.table) pairs.push(play.seat, CARD_INDEX[play.card]);
  const firstLeader = state.tricks[0]?.plays[0]?.seat ?? state.table[0]?.seat ?? state.leader;
  return { plays: Int16Array.from(pairs), count: pairs.length / 2, firstLeader };
}

/** Scratch space for one replay; allocate once per decision (`createLikelihoodScratch`). */
export interface LikelihoodScratch {
  /** The rewound world the history is replayed on. */
  h: FastRound;
  buf: Int8Array;
  feats: Float32Array;
  scores: Float32Array;
  hidden: Float32Array;
  /** Per seat: void bits revealed so far in the replay. */
  voids: Uint8Array;
  /** When set, every replayed decision sees this mask instead of the revealed voids. */
  fixedVoids: Uint8Array | null;
}

export function createLikelihoodScratch(
  base: FastRound,
  fixedVoids: Uint8Array | null = null,
): LikelihoodScratch {
  return {
    h: cloneFast(base),
    buf: new Int8Array(13),
    feats: new Float32Array(13 * FEATURES),
    scores: new Float32Array(13),
    hidden: new Float32Array(MAX_HIDDEN),
    voids: new Uint8Array(base.n),
    fixedVoids,
  };
}

/** Rewind the dealt world `f` to the start of the round's history, into `s.h`. */
function rewind(f: FastRound, hist: RoundHistory, s: LikelihoodScratch): FastRound {
  const h = s.h;
  h.owner.set(f.owner);
  h.handSize.set(f.handSize);
  for (let i = 0; i < hist.count; i++) {
    const seat = hist.plays[2 * i];
    const card = hist.plays[2 * i + 1];
    h.owner[card] = seat;
    h.handSize[seat]++;
  }
  h.tricksWon.fill(0);
  h.trump = f.trump;
  h.leader = hist.firstLeader;
  h.turn = hist.firstLeader;
  h.tableLen = 0;
  h.leadSuit = -1;
  h.cardsLeft = 0;
  for (let seat = 0; seat < h.n; seat++) h.cardsLeft += h.handSize[seat];
  h.undoLen = 0;
  if (s.fixedVoids) s.voids.set(s.fixedVoids);
  else s.voids.fill(0);
  return h;
}

/** Log-probability the policy gives `card` among `count` legal cards (scores already computed). */
function logProbOf(
  s: LikelihoodScratch,
  count: number,
  card: number,
  tau: number,
  floor: number,
): number {
  let max = Number.NEGATIVE_INFINITY;
  let played = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < count; j++) {
    const sc = s.scores[j] / tau;
    s.scores[j] = sc;
    if (sc > max) max = sc;
    if (s.buf[j] === card) played = sc;
  }
  let sum = 0;
  for (let j = 0; j < count; j++) sum += Math.exp(s.scores[j] - max);
  const p = Math.exp(played - max) / sum;
  return Math.log((1 - floor) * p + floor / count);
}

/**
 * Log-likelihood of the observed plays of `seat` in the dealt world `f` — or
 * of every seat other than `me` when `seat < 0`. `f` must be a fully dealt
 * copy of the root (its OUT cards are the undealt pool). Temperature `tau`
 * flattens the policy (1 = as fitted); `floor` mixes each probability with
 * uniform so an unmodelled style cannot zero out a deal.
 */
export function seatLogWeight(
  f: FastRound,
  me: number,
  seat: number,
  hist: RoundHistory,
  model: PolicyModel,
  tau: number,
  floor: number,
  s: LikelihoodScratch,
): number {
  if (hist.count === 0) return 0;
  const h = rewind(f, hist, s);
  const voids = s.voids;
  let logw = 0;
  for (let i = 0; i < hist.count; i++) {
    const actor = hist.plays[2 * i];
    const card = hist.plays[2 * i + 1];
    if (actor !== me && (seat < 0 || actor === seat)) {
      const count = legalInto(h, actor, s.buf);
      if (count > 1) {
        policyFeatures(h, actor, s.buf, count, voids, s.feats);
        scoreCards(s.feats, count, model, s.scores, s.hidden);
        logw += logProbOf(s, count, card, tau, floor);
      }
    }
    // A card off the led suit proves the seat void in it (a Ninja too, under
    // the follow-suit ruling) — public from this play onwards.
    const lead = h.leadSuit;
    if (lead >= 0 && !s.fixedVoids) {
      const suit = CARD_SUIT[card];
      if (suit !== lead && (suit >= 0 || RULINGS.ninjaFollowsSuit)) voids[actor] |= 1 << lead;
    }
    applyFast(h, card);
  }
  return logw;
}

/** Log-likelihood of every opponent's observed plays: Σ over seats ≠ `me` of `seatLogWeight`. */
export function worldLogWeight(
  f: FastRound,
  me: number,
  hist: RoundHistory,
  model: PolicyModel,
  tau: number,
  floor: number,
  s: LikelihoodScratch,
): number {
  return seatLogWeight(f, me, -1, hist, model, tau, floor, s);
}

/** Sanity: the rewound world must contain every card exactly once per seat count. */
export function historyIsConsistent(f: FastRound, hist: RoundHistory): boolean {
  for (let i = 0; i < hist.count; i++) if (f.owner[hist.plays[2 * i + 1]] !== PLAYED) return false;
  return N_CARDS > 0;
}
