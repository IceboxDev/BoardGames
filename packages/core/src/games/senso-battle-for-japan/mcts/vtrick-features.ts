// Features of the expected-tier net (plan Phase 3): from a DETERMINIZED trick
// position (every card's owner known, as the search sees it inside one
// sampled deal) predict, per seat, the distribution over the tier that seat
// ends the round with. Its targets come from self-play where seats acted
// under their own information, so no double-dummy knowledge leaks into the
// prediction — and because the input is the dealt world, different deals give
// different values, which is what the paired PIMC needs to average over.
//
// Encoded relative to the seat to move (`f.turn`), one net for every chair;
// the Python port in scripts/senso-train/vtrick_features.py is pinned to this
// file by a fixture dumped from the collector's ply rows.

import {
  CARD_RANK,
  CARD_SUIT,
  createFastRound,
  type FastRound,
  JADE,
  N_CARDS,
  OUT,
  PLAYED,
  WOOD,
  winningIndex,
} from "./fast-round";

export const VTRICK_SEATS = 5;
export const VTRICK_TIERS = 5;
const OWNER_CLASSES = 7; // relative seat 0..4, played, undealt
const TABLE_SLOTS = 4;
const PER_SLOT = 6;
export const VTRICK_FEATURES =
  N_CARDS * OWNER_CLASSES +
  TABLE_SLOTS * PER_SLOT +
  VTRICK_SEATS + // current winner (relative)
  5 + // lead suit one-hot + none
  1 + // table length
  VTRICK_SEATS * 2 + // tricks won, hand size
  VTRICK_SEATS * 4 + // void mask
  4 + // trump
  VTRICK_SEATS + // leader (relative)
  3; // cards left, round, players

/**
 * Fill `out[0..VTRICK_FEATURES)` from the dealt world `f`, relative to `f.turn`.
 * `voidMask` = per seat, bit `suit` set when known void; `round` 1..8.
 */
export function vtrickFeatures(
  f: FastRound,
  voidMask: Uint8Array,
  round: number,
  out: Float32Array,
): void {
  const n = f.n;
  const me = f.turn;
  const rel = (seat: number) => (seat - me + n) % n;
  out.fill(0, 0, VTRICK_FEATURES);
  let k = 0;
  for (let c = 0; c < N_CARDS; c++) {
    const o = f.owner[c];
    const cls = o === PLAYED ? 5 : o === OUT ? 6 : rel(o);
    out[k + cls] = 1;
    k += OWNER_CLASSES;
  }
  for (let i = 0; i < TABLE_SLOTS; i++) {
    if (i < f.tableLen) {
      const card = f.table[i];
      out[k] = 1;
      out[k + 1] = CARD_RANK[card] / 14;
      out[k + 2] = CARD_SUIT[card] === f.trump ? 1 : 0;
      out[k + 3] = CARD_SUIT[card] >= 0 && CARD_SUIT[card] === f.leadSuit ? 1 : 0;
      out[k + 4] = card === WOOD ? 1 : 0;
      out[k + 5] = card === JADE ? 1 : 0;
    }
    k += PER_SLOT;
  }
  if (f.tableLen > 0) out[k + rel((f.leader + winningIndex(f)) % n)] = 1;
  k += VTRICK_SEATS;
  out[k + (f.leadSuit >= 0 ? f.leadSuit : 4)] = 1;
  k += 5;
  out[k++] = f.tableLen / 4;
  for (let r = 0; r < VTRICK_SEATS; r++) {
    const seat = (me + r) % n;
    out[k + r] = r < n ? f.tricksWon[seat] / 13 : 0;
    out[k + VTRICK_SEATS + r] = r < n ? f.handSize[seat] / 13 : 0;
  }
  k += VTRICK_SEATS * 2;
  for (let r = 0; r < VTRICK_SEATS; r++) {
    const seat = (me + r) % n;
    if (r < n)
      for (let suit = 0; suit < 4; suit++) out[k + r * 4 + suit] = (voidMask[seat] >> suit) & 1;
  }
  k += VTRICK_SEATS * 4;
  out[k + f.trump] = 1;
  k += 4;
  out[k + rel(f.leader)] = 1;
  k += VTRICK_SEATS;
  out[k++] = f.cardsLeft / 50;
  out[k++] = round / 8;
  out[k++] = n / 5;
  if (k !== VTRICK_FEATURES) throw new Error(`vtrick features: filled ${k} of ${VTRICK_FEATURES}`);
}

/** Tier index (0 = none, 1..4 = tiers 1/3/5/7) of a trick count. */
export function tierIndexOf(tricks: number): number {
  if (tricks >= 7) return 4;
  if (tricks >= 5) return 3;
  if (tricks >= 3) return 2;
  if (tricks >= 1) return 1;
  return 0;
}

/**
 * Softmax the net's logits (5 seats × 5 tiers, relative order) into
 * absolute-seat probabilities `probs[(seat * 5) + t]`; unseated rows stay 0.
 */
export function tierProbabilities(logits: Float32Array, f: FastRound, probs: Float32Array): void {
  const n = f.n;
  const me = f.turn;
  probs.fill(0);
  for (let r = 0; r < n; r++) {
    const seat = (me + r) % n;
    let max = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < VTRICK_TIERS; t++) max = Math.max(max, logits[r * VTRICK_TIERS + t]);
    let sum = 0;
    for (let t = 0; t < VTRICK_TIERS; t++) {
      const e = Math.exp(logits[r * VTRICK_TIERS + t] - max);
      probs[seat * VTRICK_TIERS + t] = e;
      sum += e;
    }
    for (let t = 0; t < VTRICK_TIERS; t++) probs[seat * VTRICK_TIERS + t] /= sum;
  }
}

/** Column lookups over the collector's raw ply rows (collect-value.ts). */
export interface PlyRowColumns {
  index: (name: string) => number;
}

/** Rebuild the dealt world of a collector ply row (the fixture path; tests). */
export function fastFromPlyRow(row: ArrayLike<number>, at: PlyRowColumns): FastRound {
  const n = row[at.index("n")];
  const f = createFastRound(n);
  const owner0 = at.index("owner[0]");
  for (let c = 0; c < N_CARDS; c++) f.owner[c] = row[owner0 + c];
  f.trump = row[at.index("trump")];
  f.leader = row[at.index("leader")];
  f.turn = row[at.index("seat")];
  f.tableLen = row[at.index("tableLen")];
  const table0 = at.index("table[0]");
  for (let i = 0; i < f.tableLen; i++) f.table[i] = row[table0 + i];
  f.leadSuit = f.tableLen > 0 ? CARD_SUIT[f.table[0]] : -1;
  const tricks0 = at.index("tricksWon[0]");
  const hand0 = at.index("handSize[0]");
  f.cardsLeft = 0;
  for (let s = 0; s < n; s++) {
    f.tricksWon[s] = row[tricks0 + s];
    f.handSize[s] = row[hand0 + s];
    f.cardsLeft += f.handSize[s];
  }
  return f;
}
