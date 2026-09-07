import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { lightClone } from "../ai-rewards";
import { voidsOf } from "../ai-search";
import { applyAction, applyActionTrusted, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import { midRound } from "../test-helpers";
import type { AIStrategyId, GameState } from "../types";
import { CLANS } from "../types";
import {
  applyFast,
  buildRoot,
  CARD_ID,
  CARD_INDEX,
  cloneFast,
  fastFromState,
  fastPickPlay,
  legalInto,
  OUT,
  PLAYED,
  redeterminize,
  resetFrom,
  undoFast,
} from "./fast-round";

function snapshot(f: ReturnType<typeof fastFromState>) {
  return JSON.stringify({
    owner: [...f.owner],
    handSize: [...f.handSize],
    tricksWon: [...f.tricksWon],
    leader: f.leader,
    turn: f.turn,
    table: [...f.table].slice(0, f.tableLen),
    tableLen: f.tableLen,
    leadSuit: f.leadSuit,
    cardsLeft: f.cardsLeft,
  });
}

/** Read the phase through a function so TypeScript does not narrow it across mutations. */
function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

function legalCardsOf(state: GameState): number[] {
  return getLegalActions(state)
    .flatMap((a) => (a.type === "play" ? [CARD_INDEX[a.card]] : []))
    .sort((a, b) => a - b);
}

/** Drive one round on both models with the same (seeded) random plays. */
function playRound(players: number, seed: number): void {
  const strategies: (AIStrategyId | null)[] = Array.from({ length: players }, () => null);
  const state = createInitialState(players, strategies, seed);
  const f = fastFromState(state, -1);
  const rng = createRng(seed * 7 + 1);
  const buf = new Int8Array(13);
  let plies = 0;
  while (phaseOf(state) === "trick" || phaseOf(state) === "trick-settle") {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const seat = state.turn;
    expect(f.turn).toBe(seat);
    expect(f.leader).toBe(state.leader);
    expect(f.leadSuit).toBe(state.leadSuit === null ? -1 : CLANS.indexOf(state.leadSuit));
    expect(f.tableLen).toBe(state.table.length);
    const fastLegal = [...buf.subarray(0, legalInto(f, seat, buf))].sort((a, b) => a - b);
    expect(fastLegal).toEqual(legalCardsOf(state));

    // apply / undo round-trips byte for byte
    const before = snapshot(f);
    const card = fastLegal[Math.floor(rng() * fastLegal.length)];
    applyFast(f, card);
    undoFast(f);
    expect(snapshot(f)).toBe(before);

    applyFast(f, card);
    applyAction(state, { type: "play", card: CARD_ID[card] });
    plies++;
    if (phaseOf(state) === "trick-settle") {
      // The fast model banks the trick immediately; compare after the engine settles.
      settleTrick(state);
      expect([...f.tricksWon]).toEqual(state.players.map((p) => p.tricksWon));
      if (phaseOf(state) === "trick") {
        // (After the last trick the engine leaves leader/turn as they were.)
        expect(f.leader).toBe(state.leader);
        expect(f.turn).toBe(state.turn);
      }
    }
    expect([...f.handSize]).toEqual(state.players.map((p) => p.hand.length));
    expect(f.cardsLeft).toBe(state.players.reduce((s, p) => s + p.hand.length, 0));
  }
  expect(plies).toBe(players * 6);
  expect(f.cardsLeft).toBe(0);
  expect([...f.tricksWon]).toEqual(state.players.map((p) => p.tricksWon));
}

describe("FastRound parity with the engine", () => {
  it.each([2, 3, 4, 5])("plays seeded rounds identically at %i players", (players) => {
    for (let seed = 1; seed <= 40; seed++) playRound(players, seed);
  });

  it("undo restores a fully played round to its start", () => {
    const state = createInitialState(3, [null, null, null], 9);
    const f = fastFromState(state, -1);
    const start = snapshot(f);
    const buf = new Int8Array(13);
    const rng = createRng(3);
    let plies = 0;
    while (f.cardsLeft > 0) {
      const count = legalInto(f, f.turn, buf);
      applyFast(f, buf[Math.floor(rng() * count)]);
      plies++;
    }
    for (let i = 0; i < plies; i++) undoFast(f);
    expect(snapshot(f)).toBe(start);
  });

  it("the policy always returns one of the legal cards", () => {
    const state = createInitialState(4, [null, null, null, null], 5);
    const f = fastFromState(state, -1);
    const buf = new Int8Array(13);
    while (f.cardsLeft > 0) {
      const seat = f.turn;
      const count = legalInto(f, seat, buf);
      const legal = new Set([...buf.subarray(0, count)]);
      const pick = fastPickPlay(f, seat, buf, count);
      expect(legal.has(pick)).toBe(true);
      applyFast(f, pick);
    }
  });
});

describe("redeterminize", () => {
  it("deals the unseen cards with the right sizes, never a known card, and honours voids", () => {
    const state = createInitialState(3, [null, null, null], 3);
    state.players[0].hand = ["takeda-5", "oda-9", "mori-2"];
    state.players[1].hand = ["oda-3", "uesugi-7", "mori-11"];
    state.players[2].hand = ["takeda-9", "uesugi-4", "oda-12"];
    state.trumpSuit = "mori";
    state.turn = 0;
    state.leader = 0;
    applyAction(state, { type: "play", card: "takeda-5" });
    applyAction(state, { type: "play", card: "oda-3" }); // seat 1 is void in takeda
    applyAction(state, { type: "play", card: "takeda-9" });
    settleTrick(state);

    const root = buildRoot(state, 0, voidsOf(state));
    expect(root.voidMask[1] & (1 << CLANS.indexOf("takeda"))).not.toBe(0);
    const f = cloneFast(root.base);
    const scratch = new Int8Array(54);
    const rng = createRng(11);
    for (let i = 0; i < 30; i++) {
      resetFrom(f, root.base);
      redeterminize(f, root, rng, scratch);
      const dealt = [0, 0, 0];
      let undealt = 0;
      for (let c = 0; c < 54; c++) {
        const o = f.owner[c];
        if (o === OUT) undealt++;
        if (o >= 0) dealt[o]++;
        if (o === 1) expect(CARD_ID[c].startsWith("takeda-")).toBe(false);
        if (state.played.includes(CARD_ID[c])) expect(o).toBe(PLAYED);
      }
      expect(dealt).toEqual([2, 2, 2]);
      // 54 − 6 in hands − 3 played = 45 unseen cards stay undealt (never dealt this round).
      expect(undealt).toBe(45);
      for (const card of state.players[0].hand) expect(f.owner[CARD_INDEX[card]]).toBe(0);
    }
  });
});

/** Every node of the subtree: the engine and the fast model must agree on turn, legal set and tricks. */
function walkParity(
  state: GameState,
  f: ReturnType<typeof fastFromState>,
  budget: { nodes: number },
): void {
  if (budget.nodes-- <= 0) return;
  const sim = lightClone(state);
  if (sim.phase === "trick-settle") settleTrick(sim);
  if (sim.phase !== "trick") {
    expect([...f.tricksWon]).toEqual(sim.players.map((p) => p.tricksWon));
    return;
  }
  const engineLegal = getLegalActions(sim)
    .flatMap((a) => (a.type === "play" ? [CARD_INDEX[a.card]] : []))
    .sort((a, b) => a - b);
  const buf = new Int8Array(13);
  const count = legalInto(f, f.turn, buf);
  expect(f.turn).toBe(sim.turn);
  expect(Array.from(buf.subarray(0, count)).sort((a, b) => a - b)).toEqual(engineLegal);
  for (const card of engineLegal) {
    const next = lightClone(sim);
    applyActionTrusted(next, { type: "play", card: CARD_ID[card] });
    applyFast(f, card);
    walkParity(next, f, budget);
    undoFast(f);
  }
}

describe("apply/undo under exhaustive exploration", () => {
  // Undoing a completed trick after sibling subtrees reused the table slots
  // once restored a stale lead card (found by the 2p trick solver, 2026-09-07).
  it.each([
    [2, 8],
    [3, 6],
    [5, 5],
  ])("matches the engine at every node of a %ip subtree with %i plies left", (players, plies) => {
    for (let seed = 1; seed <= 6; seed++) {
      const state = midRound(players, seed * 7 + players, plies);
      const f = fastFromState(state, -1);
      walkParity(state, f, { nodes: 20_000 });
      expect(f.undoLen).toBe(0);
    }
  });
});
