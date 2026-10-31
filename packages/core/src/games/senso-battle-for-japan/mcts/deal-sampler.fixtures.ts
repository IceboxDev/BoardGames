// Shared fixtures for the posterior deal sampler's tests: the default-tier
// suite (deal-sampler.test.ts) and the heavy convergence check
// (deal-sampler.heavy.test.ts). Not a test file itself.

import { expect } from "vitest";
import { createRng } from "../../../lib/rng";
import { voidsOf } from "../ai-search";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import type { GameState } from "../types";
import type { SamplerOptions } from "./deal-sampler";
import {
  allowed,
  buildRoot,
  CARD_INDEX,
  cloneFast,
  N_CARDS,
  needOf,
  OUT,
  PLAYED,
  type RootInfo,
} from "./fast-round";
import { type RoundHistory, roundHistory } from "./inference";

export const OPTS: SamplerOptions = {
  chains: 4,
  burnIn: 48,
  thin: 4,
  cycleMax: 5,
  pairProb: 0.7,
  seedDraws: 32,
  tau: 3,
  floor: 0.1,
};

export function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

/** Play `plies` random legal cards and return the observer's root at that point. */
export function midRound(
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
export function consistent(f: { owner: Int8Array }, root: RootInfo): boolean {
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
export function reduceRoot(
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
export function enumerateDeals(root: RootInfo): Int8Array[] {
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

export function dealKey(f: { owner: Int8Array }, root: RootInfo): string {
  let key = "";
  for (let i = 0; i < root.unseen.length; i++) key += `${f.owner[root.unseen[i]]},`;
  return key;
}
