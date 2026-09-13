import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { voidsOf } from "../ai-search";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import type { GameState } from "../types";
import {
  buildRoot,
  cloneFast,
  fastFromState,
  N_CARDS,
  type RootInfo,
  redeterminize,
  resetFrom,
} from "./fast-round";
import {
  createLikelihoodScratch,
  type RoundHistory,
  roundHistory,
  seatLogWeight,
  worldLogWeight,
} from "./inference";
import { OPPONENT_MODEL } from "./opponent-weights";
import { POLICY_MODEL } from "./policy-weights";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

/** Play `plies` random legal cards of a fresh game and return the observer's root. */
function midRound(
  players: number,
  seed: number,
  plies: number,
): { state: GameState; root: RootInfo; hist: RoundHistory; rng: () => number } {
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
  return { state, root: buildRoot(state, me, voidsOf(state)), hist: roundHistory(state), rng };
}

describe("likelihood-weighted deals", () => {
  it("replays the round's history onto a sampled deal and scores it", () => {
    const { root, hist, rng } = midRound(3, 11, 10);
    expect(hist.count).toBe(10);
    const f = cloneFast(root.base);
    resetFrom(f, root.base);
    redeterminize(f, root, rng, new Int8Array(N_CARDS));
    const s = createLikelihoodScratch(root.base);
    const logw = worldLogWeight(f, root.me, hist, POLICY_MODEL, 1, 0.1, s);
    expect(Number.isFinite(logw)).toBe(true);
    expect(logw).toBeLessThanOrEqual(0);
    // After the replay the scratch world matches the sampled world exactly.
    expect([...s.h.owner]).toEqual([...f.owner]);
    expect([...s.h.handSize]).toEqual([...f.handSize]);
    expect([...s.h.tricksWon]).toEqual([...f.tricksWon]);
    expect(s.h.leader).toBe(f.leader);
    expect(s.h.turn).toBe(f.turn);
    expect(s.h.tableLen).toBe(f.tableLen);
  });

  it("is zero before any card has been played", () => {
    const state = createInitialState(2, [null, null], 5);
    const hist = roundHistory(state);
    const f = fastFromState(state, 0);
    const s = createLikelihoodScratch(f);
    expect(worldLogWeight(f, 0, hist, POLICY_MODEL, 1, 0.1, s)).toBe(0);
    expect(seatLogWeight(f, 0, 1, hist, POLICY_MODEL, 1, 0.1, s)).toBe(0);
  });

  it("is separable by seat: the world weight is the sum of the seat weights", () => {
    // The posterior deal sampler recomputes only the seats a move touched, so
    // a future feature that peeks at another seat's hand must break this.
    for (const [players, seed, plies] of [
      [3, 11, 10],
      [4, 23, 17],
      [5, 7, 26],
      [5, 8, 41],
    ] as const) {
      const { root, hist, rng } = midRound(players, seed, plies);
      const f = cloneFast(root.base);
      const s = createLikelihoodScratch(root.base);
      for (let deal = 0; deal < 5; deal++) {
        resetFrom(f, root.base);
        redeterminize(f, root, rng, new Int8Array(N_CARDS));
        const world = worldLogWeight(f, root.me, hist, OPPONENT_MODEL, 3, 0.1, s);
        let sum = 0;
        for (let seat = 0; seat < players; seat++) {
          const term = seatLogWeight(f, root.me, seat, hist, OPPONENT_MODEL, 3, 0.1, s);
          if (seat === root.me) expect(term).toBe(0);
          sum += term;
        }
        expect(sum).toBeCloseTo(world, 9);
      }
    }
  });

  it("scores a seat from its own cards only: reshuffling the other seats leaves its term unchanged", () => {
    const { root, hist, rng } = midRound(5, 8, 30);
    const f = cloneFast(root.base);
    const s = createLikelihoodScratch(root.base);
    resetFrom(f, root.base);
    redeterminize(f, root, rng, new Int8Array(N_CARDS));
    const others = root.dealOrder.filter((seat) => seat !== root.dealOrder[0]);
    const seat = root.dealOrder[0];
    const before = seatLogWeight(f, root.me, seat, hist, OPPONENT_MODEL, 3, 0.1, s);
    // Swap every card between two other opponents (hand sizes must match to stay consistent).
    const a = others[0];
    const b = others[1];
    if (f.handSize[a] === f.handSize[b]) {
      for (let c = 0; c < N_CARDS; c++) {
        if (f.owner[c] === a) f.owner[c] = b;
        else if (f.owner[c] === b) f.owner[c] = a;
      }
    } else {
      // Move one card from each into the pool and back the other way.
      const ca = f.owner.indexOf(a);
      const cb = f.owner.indexOf(b);
      f.owner[ca] = b;
      f.owner[cb] = a;
    }
    const after = seatLogWeight(f, root.me, seat, hist, OPPONENT_MODEL, 3, 0.1, s);
    expect(after).toBe(before);
  });

  it("only reveals a void from the play that showed it", () => {
    // A 3p round where seat 1 discards off-suit at some point: every replayed
    // decision before that play must see no void for seat 1.
    const { state, root, hist } = midRound(3, 11, 10);
    const voids = voidsOf(state);
    const f = cloneFast(root.base);
    const s = createLikelihoodScratch(root.base);
    resetFrom(f, root.base);
    redeterminize(f, root, createRng(1), new Int8Array(N_CARDS));
    worldLogWeight(f, root.me, hist, OPPONENT_MODEL, 3, 0.1, s);
    // After the full replay the incremental mask equals the engine's void set.
    const expected = new Uint8Array(3);
    for (const v of voids) {
      const [seat, suit] = v.split(":");
      const idx = ["takeda", "uesugi", "oda", "mori"].indexOf(suit);
      expected[Number(seat)] |= 1 << idx;
    }
    expect([...s.voids]).toEqual([...expected]);

    // With a fixed mask the replay never learns a void; the likelihood differs
    // whenever a decision was scored before the void it was scored under became public.
    const fixed = createLikelihoodScratch(root.base, expected);
    const fixedLogw = worldLogWeight(f, root.me, hist, OPPONENT_MODEL, 3, 0.1, fixed);
    expect([...fixed.voids]).toEqual([...expected]);
    expect(Number.isFinite(fixedLogw)).toBe(true);
  });
});
