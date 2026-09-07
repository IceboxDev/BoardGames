// Learned playout policy: a per-card linear score over public-information
// features, softmax over the legal cards. Fitted offline on the search's own
// decisions (`collect-policy.ts` → `fit-policy.ts`), so a playout plays the
// way the search plays instead of the way Daimyō plays.

import { reachableTier } from "../ai-tricks";
import {
  CARD_RANK,
  CARD_SUIT,
  type FastRound,
  JADE,
  N_CARDS,
  PLAYED,
  WOOD,
  winKey,
  winningIndex,
} from "./fast-round";

export const FEATURES = 36;
const TIERS = [1, 3, 5, 7];

function nextTier(tricks: number): number {
  for (const t of TIERS) if (t > tricks) return t;
  return 0;
}

/**
 * Fill `out[i * FEATURES .. ]` for each legal card `buf[i]` from `seat`'s
 * public view of `f` (its own cards, the played cards; the rest OUT). `voidMask`
 * marks seats known to be void of a suit (bit = suit).
 */
export function policyFeatures(
  f: FastRound,
  seat: number,
  buf: Int8Array,
  count: number,
  voidMask: Uint8Array,
  out: Float32Array,
): void {
  const n = f.n;
  const trump = f.trump;
  const remaining = f.handSize[seat];
  const t = f.tricksWon[seat];
  const reachable = reachableTier(t, remaining);
  const chasing = t < reachable ? 1 : 0;
  const slack = t + remaining - reachable;
  const gap = nextTier(t) === 0 ? 0 : (nextTier(t) - t) / 7;
  const leading = f.tableLen === 0 ? 1 : 0;
  const isLast = f.tableLen === n - 1 ? 1 : 0;
  const currentBest = leading ? -2 : winKey(f.table[winningIndex(f)], trump, f.leadSuit);
  const leadIsTrump = !leading && f.leadSuit === trump ? 1 : 0;

  // Suit tallies from the public view.
  const mine = [0, 0, 0, 0];
  const unseen = [0, 0, 0, 0];
  let unseenTrumps = 0;
  let unseenNinjas = 0;
  for (let c = 0; c < N_CARDS; c++) {
    const o = f.owner[c];
    const s = CARD_SUIT[c];
    if (o === seat) {
      if (s >= 0) mine[s]++;
    } else if (o !== PLAYED) {
      if (s >= 0) {
        unseen[s]++;
        if (s === trump) unseenTrumps++;
      } else unseenNinjas++;
    }
  }
  const othersVoid = [0, 0, 0, 0];
  for (let s = 0; s < n; s++) {
    if (s === seat) continue;
    for (let suit = 0; suit < 4; suit++) if (voidMask[s] & (1 << suit)) othersVoid[suit]++;
  }

  // Legal-set aggregates.
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  let cheapestWinner = Number.POSITIVE_INFINITY;
  const strength = new Float32Array(count);
  const wins = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const c = buf[i];
    const st =
      c === JADE
        ? 200
        : c === WOOD
          ? 100
          : CARD_SUIT[c] === trump
            ? 50 + CARD_RANK[c]
            : CARD_RANK[c];
    strength[i] = st;
    const lead = leading ? CARD_SUIT[c] : f.leadSuit;
    const w = leading ? 1 : winKey(c, trump, lead) > currentBest ? 1 : 0;
    wins[i] = w;
    if (st < lowest) lowest = st;
    if (st > highest) highest = st;
    if (w && st < cheapestWinner) cheapestWinner = st;
  }

  for (let i = 0; i < count; i++) {
    const c = buf[i];
    const suit = CARD_SUIT[c];
    const rank = CARD_RANK[c];
    const ninja = suit < 0;
    const isTrump = !ninja && suit === trump ? 1 : 0;
    const lead = leading ? suit : f.leadSuit;
    const key = winKey(c, trump, lead);
    // Honest safety: no card the seat cannot see beats it in this trick.
    let safe = wins[i];
    if (safe && !isLast && key < 300) {
      for (let x = 0; x < N_CARDS && safe; x++) {
        const o = f.owner[x];
        if (o === seat || o === PLAYED) continue;
        if (winKey(x, trump, lead) > key) safe = 0;
      }
    }
    let unseenHigher = 0;
    let unseenLower = 0;
    let myHigher = 0;
    if (!ninja) {
      for (let r = 2; r <= 14; r++) {
        const x = suit * 13 + (r - 2);
        const o = f.owner[x];
        if (o === seat) {
          if (r > rank) myHigher++;
        } else if (o !== PLAYED) {
          if (r > rank) unseenHigher++;
          else if (r < rank) unseenLower++;
        }
      }
    }
    const base = i * FEATURES;
    let k = base;
    out[k++] = 1; // bias (cancels in softmax, harmless)
    out[k++] = isTrump;
    out[k++] = ninja ? 0 : rank / 14;
    out[k++] = c === WOOD ? 1 : 0;
    out[k++] = c === JADE ? 1 : 0;
    out[k++] = wins[i];
    out[k++] = safe;
    out[k++] = wins[i] && strength[i] === cheapestWinner ? 1 : 0;
    out[k++] = strength[i] === lowest ? 1 : 0;
    out[k++] = strength[i] === highest ? 1 : 0;
    out[k++] = ninja ? 0 : mine[suit] / 13;
    out[k++] = ninja ? 0 : unseen[suit] / 13;
    out[k++] = unseenHigher / 13;
    out[k++] = unseenLower / 13;
    out[k++] = myHigher / 13;
    out[k++] = leading;
    out[k++] = isLast;
    out[k++] = chasing;
    out[k++] = slack / 13;
    out[k++] = gap;
    out[k++] = remaining / 13;
    out[k++] = ninja ? 0 : othersVoid[suit] / 4;
    out[k++] = unseenTrumps / 13;
    out[k++] = mine[trump] / 13;
    out[k++] = unseenNinjas / 2;
    out[k++] = n / 5;
    out[k++] = isTrump && !leadIsTrump && !leading ? 1 : 0; // ruff
    // Interactions.
    out[k++] = chasing * wins[i];
    out[k++] = chasing * safe;
    out[k++] = (1 - chasing) * (strength[i] === lowest ? 1 : 0);
    out[k++] = leading * (unseenHigher / 13);
    out[k++] = leading * isTrump;
    out[k++] = leading * (ninja ? 0 : mine[suit] / 13);
    out[k++] = (slack > 0 ? 1 : 0) * wins[i];
    out[k++] = isLast * wins[i];
    out[k++] = (ninja ? 1 : 0) * chasing;
    if (k - base !== FEATURES) throw new Error(`FEATURES mismatch: ${k - base}`);
  }
}

export interface PolicyModel {
  /** Hidden units; 0 = linear (w2 holds the per-feature weights). */
  hidden: number;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: number;
}

/** Scores every legal card from `feats` (count × FEATURES) into `out`. */
export function scoreCards(
  feats: Float32Array,
  count: number,
  model: PolicyModel,
  out: Float32Array,
  hiddenScratch: Float32Array,
): void {
  const H = model.hidden;
  for (let i = 0; i < count; i++) {
    const base = i * FEATURES;
    if (H === 0) {
      let s = model.b2;
      for (let k = 0; k < FEATURES; k++) s += model.w2[k] * feats[base + k];
      out[i] = s;
      continue;
    }
    for (let j = 0; j < H; j++) {
      let z = model.b1[j];
      const row = j * FEATURES;
      for (let k = 0; k < FEATURES; k++) z += model.w1[row + k] * feats[base + k];
      hiddenScratch[j] = z > 0 ? z : 0;
    }
    let s = model.b2;
    for (let j = 0; j < H; j++) s += model.w2[j] * hiddenScratch[j];
    out[i] = s;
  }
}

export const MAX_HIDDEN = 64;

/** argmax of the policy scores; `scratch` must hold `count * FEATURES` floats. */
export function learnedPickPlay(
  f: FastRound,
  seat: number,
  buf: Int8Array,
  count: number,
  voidMask: Uint8Array,
  model: PolicyModel,
  scratch: Float32Array,
  scores: Float32Array,
  hidden: Float32Array,
): number {
  if (count === 1) return buf[0];
  policyFeatures(f, seat, buf, count, voidMask, scratch);
  scoreCards(scratch, count, model, scores, hidden);
  let best = buf[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      best = buf[i];
    }
  }
  return best;
}
