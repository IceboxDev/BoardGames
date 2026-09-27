import { describe, expect, it } from "vitest";
import { pickAiAction } from "../ai-strategies";
import { applyUnchecked, createInitialState } from "../game-engine";
import { buildPlayerView } from "../player-view";
import { getActivePlayer } from "../rules";
import type { GameState } from "../types";
import { determinize, mulberry32 } from "./determinize";

function midGame(n: number, seed: number, steps: number): GameState {
  let s = createInitialState({
    playerCount: n,
    strategies: Array(n).fill("heuristic-v1"),
    seed,
  });
  for (let i = 0; i < steps && s.phase !== "game-over"; i++) {
    s = applyUnchecked(s, getActivePlayer(s), pickAiAction(s));
  }
  return s;
}

const viewOf = (s: GameState, seat: number) => ({ ...buildPlayerView(s, seat), log: [] });

function everyCard(s: GameState): string[] {
  const out = [...s.huntDeck, ...s.tavern, ...s.roses, ...s.track.flat(2)];
  for (const p of s.players) {
    out.push(...p.deck, ...p.hand, ...p.discard, ...p.digested, ...p.playArea.map((c) => c.id));
    if (s.current?.player === p.index) out.push(...s.current.readyQueue);
  }
  return out.sort();
}

describe("determinize", () => {
  for (const [n, steps] of [
    [2, 40],
    [4, 90],
    [6, 150],
  ] as const) {
    it(`keeps the observer's view and every card at ${n}p`, () => {
      const s = midGame(n, 17 + n, steps);
      const seat = getActivePlayer(s);
      for (let k = 0; k < 5; k++) {
        const w = determinize(s, seat, mulberry32(k));
        expect(viewOf(w, seat)).toEqual(viewOf(s, seat));
        expect(everyCard(w)).toEqual(everyCard(s));
        const missions = (x: GameState) =>
          [
            ...x.players.flatMap((p) => p.missions),
            ...Object.values(x.crypts).flat(),
            ...x.setupOffers.flat(),
          ].length;
        expect(missions(w)).toBe(missions(s));
      }
    });
  }

  it("depends only on the view: swapping hidden cards gives the same world", () => {
    const s = midGame(4, 5, 60);
    const seat = getActivePlayer(s);
    const t = structuredClone(s);
    t.huntDeck.reverse();
    const rival = t.players[(seat + 1) % 4];
    rival.deck.reverse();
    t.rng = 12345;
    const a = determinize(s, seat, mulberry32(9));
    const b = determinize(t, seat, mulberry32(9));
    expect(b).toEqual(a);
  });

  it("actually varies the hidden parts", () => {
    const s = midGame(4, 8, 60);
    const seat = getActivePlayer(s);
    const a = determinize(s, seat, mulberry32(1));
    const b = determinize(s, seat, mulberry32(2));
    expect(b.huntDeck).not.toEqual(a.huntDeck);
  });
});
