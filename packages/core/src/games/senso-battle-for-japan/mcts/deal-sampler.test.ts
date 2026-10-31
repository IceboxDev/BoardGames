import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { PosteriorDealSampler } from "./deal-sampler";
import {
  consistent,
  dealKey,
  enumerateDeals,
  midRound,
  OPTS,
  reduceRoot,
} from "./deal-sampler.fixtures";
import {
  cloneFast,
  createFastRound,
  dealByMatching,
  dealRespectsVoids,
  N_CARDS,
  needOf,
  OUT,
  PLAYED,
  type RootInfo,
  redeterminize,
  resetFrom,
} from "./fast-round";
import { type RoundHistory, roundHistory } from "./inference";
import { OPPONENT_MODEL } from "./opponent-weights";

describe("posterior deal sampler", () => {
  it("keeps every emitted deal consistent with hand sizes and revealed voids", () => {
    for (const [players, seed, plies] of [
      [3, 11, 22],
      [5, 8, 33],
      [5, 21, 44],
      [4, 5, 30],
    ] as const) {
      const { root, hist } = midRound(players, seed, plies);
      let voids = 0;
      for (let s = 0; s < players; s++) voids += root.voidMask[s] ? 1 : 0;
      const sampler = new PosteriorDealSampler(root, hist, OPPONENT_MODEL, OPTS, createRng(seed));
      const f = cloneFast(root.base);
      let bad = 0;
      for (let i = 0; i < 1000; i++) {
        resetFrom(f, root.base);
        sampler.next(f);
        if (!consistent(f, root)) bad++;
      }
      expect(bad).toBe(0);
      expect(sampler.stats.proposals).toBeGreaterThan(1000 * OPTS.thin);
      // Something must actually move for the invariance to mean anything.
      expect(sampler.stats.accepted).toBeGreaterThan(100);
      if (voids > 0) expect(sampler.stats.voidRejects).toBeGreaterThan(0);
    }
  }, 20_000);

  it("emits identical deals for the same seed and different ones otherwise", () => {
    const { root, hist } = midRound(5, 8, 33);
    const run = (seed: number) => {
      const sampler = new PosteriorDealSampler(root, hist, OPPONENT_MODEL, OPTS, createRng(seed));
      const f = cloneFast(root.base);
      const keys: string[] = [];
      for (let i = 0; i < 40; i++) {
        resetFrom(f, root.base);
        sampler.next(f);
        keys.push(dealKey(f, root));
      }
      return keys;
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it("caches per-seat likelihood terms that match a fresh replay", () => {
    const { root, hist } = midRound(5, 21, 44);
    const sampler = new PosteriorDealSampler(root, hist, OPPONENT_MODEL, OPTS, createRng(9));
    const f = cloneFast(root.base);
    for (let i = 0; i < 400; i++) {
      resetFrom(f, root.base);
      sampler.next(f);
    }
    expect(sampler.cacheError()).toBeLessThan(1e-9);
    expect(Number.isFinite(sampler.peekLogLikelihood())).toBe(true);
  });

  it("with a flat likelihood reproduces uniform dealing over the consistent deals", () => {
    const { state, root: full } = midRound(3, 7, 26);
    const root = reduceRoot(state, full, { [full.dealOrder[0]]: 3, [full.dealOrder[1]]: 3 }, 2);
    const all = enumerateDeals(root);
    const deals = all.filter((owner) => dealRespectsVoids({ owner }, root));
    // The revealed void must exclude some assignments, or voids go untested here.
    expect(all.length).toBe(560);
    expect(deals.length).toBe(40);
    const hist = roundHistory(state);
    const sampler = new PosteriorDealSampler(root, hist, null, { ...OPTS, thin: 6 }, createRng(1));
    const counts = new Map<string, number>();
    const f = cloneFast(root.base);
    const draws = deals.length * 120;
    for (let i = 0; i < draws; i++) {
      resetFrom(f, root.base);
      sampler.next(f);
      const key = dealKey(f, root);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Every consistent deal was reached, none outside the set.
    expect(counts.size).toBe(deals.length);
    // Pearson chi-square against uniform; df = deals − 1, mean df, sd √(2·df).
    const expected = draws / deals.length;
    let chi2 = 0;
    for (const owner of deals) {
      const key = dealKey({ owner }, root);
      const c = counts.get(key) ?? 0;
      chi2 += ((c - expected) * (c - expected)) / expected;
    }
    const df = deals.length - 1;
    expect(chi2).toBeLessThan(df + 4 * Math.sqrt(2 * df));
    // Only void rejections can refuse a move under a flat likelihood.
    expect(sampler.stats.accepted + sampler.stats.voidRejects).toBe(sampler.stats.proposals);
    expect(sampler.stats.voidRejects).toBeGreaterThan(0);
  });

  it("needs rotations longer than swaps when voids make every swap illegal", () => {
    // Four seats: me (0) and three opponents each holding ONE card, one card
    // undealt. Suits 0..3 in seats 1, 2, 3 and the pool; each seat is void in
    // the suit of the card the next seat holds and in the pool card's suit, so
    // every pair swap is refused — only the 3-rotation 1→2→3→1 moves.
    const base = createFastRound(4);
    base.owner.fill(PLAYED);
    const card = (suit: number) => suit * 13; // rank-2 card of each suit
    base.owner[card(0)] = 0;
    base.handSize.set([1, 1, 1, 1]);
    base.cardsLeft = 4;
    base.leader = 0;
    base.turn = 0;
    const unseen = Int8Array.from([card(1), card(2), card(3), 1]); // suit 0 rank 3 is the pool card
    for (const c of unseen) base.owner[c] = OUT;
    const voidMask = new Uint8Array(4);
    voidMask[1] = (1 << 2) | (1 << 0); // seat 1 may not take seat 2's suit nor the pool card
    voidMask[2] = (1 << 3) | (1 << 0);
    voidMask[3] = (1 << 1) | (1 << 0);
    const root: RootInfo = {
      me: 0,
      base,
      unseen,
      voidMask,
      dealOrder: Int8Array.from([1, 2, 3]),
      need: needOf(base, 0),
    };
    const hist: RoundHistory = { plays: new Int16Array(0), count: 0, firstLeader: 0 };
    const visited = (cycleMax: number) => {
      const sampler = new PosteriorDealSampler(
        root,
        hist,
        null,
        { ...OPTS, cycleMax, thin: 1, burnIn: 0, seedDraws: 4, chains: 1 },
        createRng(2),
      );
      const seen = new Set<string>();
      const f = cloneFast(base);
      for (let i = 0; i < 300; i++) {
        resetFrom(f, base);
        sampler.next(f);
        expect(consistent(f, root)).toBe(true);
        seen.add(dealKey(f, root));
      }
      return seen.size;
    };
    expect(visited(2)).toBe(1);
    expect(visited(3)).toBe(2);
  });

  it("the greedy dealer's matching fallback always respects voids", () => {
    // The exact fallback on real late-round roots: every deal consistent and
    // still random from call to call.
    for (const [players, seed, plies] of [
      [5, 21, 44],
      [5, 8, 33],
      [3, 7, 26],
    ] as const) {
      const { root } = midRound(players, seed, plies);
      const f = cloneFast(root.base);
      const rng = createRng(3);
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        resetFrom(f, root.base);
        dealByMatching(f, root, rng, new Int8Array(N_CARDS));
        expect(dealRespectsVoids(f, root)).toBe(true);
        expect(consistent(f, root)).toBe(true);
        keys.add(dealKey(f, root));
      }
      expect(keys.size).toBeGreaterThan(50);
    }
    // And on a root where a greedy fill can strand a seat: seat 2 (two
    // irrelevant voids, dealt first) may take the only card seat 1 can hold.
    const base = createFastRound(3);
    base.owner.fill(PLAYED);
    base.owner[0 * 13] = 0;
    base.handSize.set([1, 1, 1]);
    base.cardsLeft = 3;
    const unseen = Int8Array.from([1, 13]); // suit 0 rank 3, suit 1 rank 2
    for (const c of unseen) base.owner[c] = OUT;
    const voidMask = new Uint8Array(3);
    voidMask[1] = 1 << 1; // seat 1 must take the suit-0 card
    voidMask[2] = (1 << 2) | (1 << 3);
    const root: RootInfo = {
      me: 0,
      base,
      unseen,
      voidMask,
      dealOrder: Int8Array.from([2, 1]),
      need: needOf(base, 0),
    };
    const f = cloneFast(base);
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      resetFrom(f, base);
      redeterminize(f, root, rng, new Int8Array(N_CARDS));
      expect(f.owner[1]).toBe(1);
      expect(f.owner[13]).toBe(2);
    }
  });
});
