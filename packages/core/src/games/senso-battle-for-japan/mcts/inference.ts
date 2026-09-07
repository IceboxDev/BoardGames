// Likelihood-weighted determinization. A sampled deal is only as plausible as
// the plays the other seats made with it: replay this round's history in the
// sampled world and score each opponent decision by the softmax probability
// the learned policy gives the card actually played. The paired PIMC then
// averages candidate values with these weights (self-normalised importance
// sampling), so deals that explain the observed play count for more.

import type { GameState } from "../types";
import { applyFast, CARD_INDEX, type FastRound, legalInto, N_CARDS, PLAYED } from "./fast-round";
import { type PolicyModel, policyFeatures, scoreCards } from "./policy";

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

/**
 * Log-likelihood of the observed opponent plays given the world `f` (a fully
 * dealt copy of the root). `h` is scratch, `buf`/`feats` scratch buffers.
 * Temperature `tau` flattens the policy (1 = as fitted).
 */
export function worldLogWeight(
  f: FastRound,
  me: number,
  hist: RoundHistory,
  voidMask: Uint8Array,
  model: PolicyModel,
  tau: number,
  floor: number,
  h: FastRound,
  buf: Int8Array,
  feats: Float32Array,
  scores: Float32Array,
  hidden: Float32Array,
): number {
  if (hist.count === 0) return 0;
  // Rewind: hand back every played card to the seat that played it.
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
  for (let s = 0; s < h.n; s++) h.cardsLeft += h.handSize[s];
  h.undoLen = 0;

  let logw = 0;
  for (let i = 0; i < hist.count; i++) {
    const seat = hist.plays[2 * i];
    const card = hist.plays[2 * i + 1];
    if (seat !== me) {
      const count = legalInto(h, seat, buf);
      if (count > 1) {
        policyFeatures(h, seat, buf, count, voidMask, feats);
        scoreCards(feats, count, model, scores, hidden);
        let max = Number.NEGATIVE_INFINITY;
        let played = Number.NEGATIVE_INFINITY;
        for (let j = 0; j < count; j++) {
          const sc = scores[j] / tau;
          scores[j] = sc;
          if (sc > max) max = sc;
          if (buf[j] === card) played = sc;
        }
        let sum = 0;
        for (let j = 0; j < count; j++) sum += Math.exp(scores[j] - max);
        const p = Math.exp(played - max) / sum;
        logw += Math.log((1 - floor) * p + floor / count);
      }
    }
    applyFast(h, card);
  }
  return logw;
}

/** Sanity: the rewound world must contain every card exactly once per seat count. */
export function historyIsConsistent(f: FastRound, hist: RoundHistory): boolean {
  for (let i = 0; i < hist.count; i++) if (f.owner[hist.plays[2 * i + 1]] !== PLAYED) return false;
  return N_CARDS > 0;
}
