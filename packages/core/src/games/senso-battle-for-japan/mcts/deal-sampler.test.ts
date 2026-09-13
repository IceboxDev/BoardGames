import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { voidsOf } from "../ai-search";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import type { GameState } from "../types";
import { PosteriorDealSampler, type SamplerOptions } from "./deal-sampler";
import {
  allowed,
  buildRoot,
  CARD_INDEX,
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
import {
  createLikelihoodScratch,
  type RoundHistory,
  roundHistory,
  worldLogWeight,
} from "./inference";
import { OPPONENT_MODEL } from "./opponent-weights";

const OPTS: SamplerOptions = {
  chains: 4,
  burnIn: 48,
  thin: 4,
  cycleMax: 5,
  pairProb: 0.7,
  seedDraws: 32,
  tau: 3,
  floor: 0.1,
};

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

/** Play `plies` random legal cards and return the observer's root at that point. */
function midRound(
  players: number,
  seed: number,
  plies: number,
): { state: GameState; root: RootInfo; hist: RoundHistory } {
  const state = createInitialState(players, Array(players).fill(null), seed);
  const rng = createRng(seed);
  let played = 0;
  while (played < plies) {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const legal = getLegalActions(state);
    applyAction(state, legal[Math.floor(rng() * legal.length)]);
    played++;
  }
  if (phaseOf(state) === "trick-settle") settleTrick(state);
  const me = state.turn;
  return { state, root: buildRoot(state, me, voidsOf(state)), hist: roundHistory(state) };
}

/** Every unseen card sits on an opponent or in the pool, hand counts match, no void is broken. */
function consistent(f: { owner: Int8Array }, root: RootInfo): boolean {
  const count = new Uint8Array(root.base.n);
  for (let i = 0; i < root.unseen.length; i++) {
    const card = root.unseen[i];
    const o = f.owner[card];
    if (o === OUT) continue;
    if (o < 0 || o === root.me || !allowed(root, o, card)) return false;
    count[o]++;
  }
  for (let seat = 0; seat < root.base.n; seat++) if (count[seat] !== root.need[seat]) return false;
  return true;
}

/**
 * Reveal all but a few of the unseen cards to their true owners, leaving a
 * root with a small enumerable posterior: `perSeat[seat]` cards stay hidden
 * in each opponent's hand and `pool` undealt cards stay hidden; every other
 * unseen card is shown in its seat (or marked played when it was undealt).
 */
function reduceRoot(
  state: GameState,
  root: RootInfo,
  perSeat: Record<number, number>,
  pool: number,
): RootInfo {
  const base = cloneFast(root.base);
  const trueOwner = new Int8Array(N_CARDS).fill(OUT);
  state.players.forEach((p, seat) => {
    for (const card of p.hand) trueOwner[CARD_INDEX[card]] = seat;
  });
  const hidden: number[] = [];
  const left = { ...perSeat };
  let poolLeft = pool;
  for (let i = 0; i < root.unseen.length; i++) {
    const card = root.unseen[i];
    const owner = trueOwner[card];
    if (owner >= 0) {
      if ((left[owner] ?? 0) > 0) {
        left[owner]--;
        hidden.push(card);
      } else base.owner[card] = owner;
    } else if (poolLeft > 0) {
      poolLeft--;
      hidden.push(card);
    } else base.owner[card] = PLAYED;
  }
  const wanted = pool + Object.values(perSeat).reduce((a, b) => a + b, 0);
  expect(hidden.length).toBe(wanted);
  return {
    me: root.me,
    base,
    unseen: Int8Array.from(hidden),
    voidMask: root.voidMask,
    dealOrder: root.dealOrder,
    need: needOf(base, root.me),
  };
}

/** Every assignment of the unseen cards consistent with the root's counts. */
function enumerateDeals(root: RootInfo): Int8Array[] {
  const out: Int8Array[] = [];
  const unseen = Array.from(root.unseen);
  const owner = new Int8Array(N_CARDS);
  owner.set(root.base.owner);
  const need = Uint8Array.from(root.need);
  const seats = Array.from(root.dealOrder);
  let poolLeft = unseen.length;
  for (const seat of seats) poolLeft -= need[seat];
  const rec = (i: number) => {
    if (i === unseen.length) {
      out.push(Int8Array.from(owner));
      return;
    }
    const card = unseen[i];
    for (const seat of seats) {
      if (need[seat] === 0) continue;
      need[seat]--;
      owner[card] = seat;
      rec(i + 1);
      need[seat]++;
    }
    if (poolLeft > 0) {
      poolLeft--;
      owner[card] = OUT;
      rec(i + 1);
      poolLeft++;
    }
    owner[card] = OUT;
  };
  rec(0);
  return out;
}

function dealKey(f: { owner: Int8Array }, root: RootInfo): string {
  let key = "";
  for (let i = 0; i < root.unseen.length; i++) key += `${f.owner[root.unseen[i]]},`;
  return key;
}

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

  it("converges to the enumerated posterior on reduced 3-player positions", () => {
    // Two roots: 560 consistent deals without voids, 40 with a revealed void.
    for (const [seed, plies, consistent, ratio] of [
      [11, 22, 560, 3],
      [7, 26, 40, 1.5],
    ] as const) {
      const { state, root: full, hist } = midRound(3, seed, plies);
      const root = reduceRoot(state, full, { [full.dealOrder[0]]: 3, [full.dealOrder[1]]: 3 }, 2);
      const all = enumerateDeals(root);
      expect(all.length).toBe(560);
      // Posterior ∝ likelihood over the void-consistent deals.
      const scratch = createLikelihoodScratch(root.base);
      const f = cloneFast(root.base);
      const logw: number[] = [];
      const keys: string[] = [];
      for (const owner of all) {
        if (!dealRespectsVoids({ owner }, root)) continue;
        f.owner.set(owner);
        logw.push(worldLogWeight(f, root.me, hist, OPPONENT_MODEL, OPTS.tau, OPTS.floor, scratch));
        keys.push(dealKey({ owner }, root));
      }
      expect(keys.length).toBe(consistent);
      const max = Math.max(...logw);
      let z = 0;
      const post = logw.map((l) => {
        const p = Math.exp(l - max);
        z += p;
        return p;
      });
      for (let i = 0; i < post.length; i++) post[i] /= z;
      // The likelihood must actually discriminate, or the test says nothing.
      expect(Math.max(...post) / Math.min(...post)).toBeGreaterThan(ratio);

      const sampler = new PosteriorDealSampler(
        root,
        hist,
        OPPONENT_MODEL,
        { ...OPTS, thin: 2 },
        createRng(5),
      );
      const counts = new Map<string, number>();
      const steps = 200_000;
      for (let i = 0; i < steps; i++) {
        resetFrom(f, root.base);
        sampler.next(f);
        const key = dealKey(f, root);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let tv = 0;
      let seen = 0;
      let iid = 0;
      let uniformTv = 0;
      for (let i = 0; i < keys.length; i++) {
        const c = counts.get(keys[i]) ?? 0;
        seen += c;
        tv += Math.abs(c / steps - post[i]);
        // Expected |empirical − p| of an i.i.d. draw (mean absolute deviation of a binomial).
        iid += Math.sqrt((2 * post[i] * (1 - post[i])) / (Math.PI * steps));
        uniformTv += Math.abs(1 / keys.length - post[i]);
      }
      expect(seen).toBe(steps); // never a deal outside the consistent set
      // Within the plan's bound, within three times the Monte Carlo error of
      // exact sampling (the chain's samples are correlated), and far from what
      // a sampler that ignored the likelihood would produce.
      expect(tv / 2).toBeLessThan(0.03);
      expect(tv / 2).toBeLessThan(3 * (iid / 2));
      expect(tv / 2).toBeLessThan(uniformTv / 2 / 4);
    }
  }, 60_000);

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
