import { describe, expect, it } from "vitest";
import { pickAiAction } from "../ai-strategies";
import { applyActionPure, applyUnchecked, createInitialState } from "../game-engine";
import { getActivePlayer } from "../rules";
import type { AIStrategyId, GameState } from "../types";
import { cloneState } from "./clone";

const withoutLog = (s: GameState) => ({ ...s, log: [] });

function playBoth(n: number, seed: number, mode: "elder" | "rookie") {
  const strategies = Array.from(
    { length: n },
    (_, i): AIStrategyId => (i % 2 === 0 ? "heuristic-v1" : "random"),
  );
  let slow = createInitialState({ playerCount: n, strategies, seed, options: { mode } });
  let fast = cloneState(slow);
  let steps = 0;
  while (slow.phase !== "game-over" && steps++ < 5000) {
    const seat = getActivePlayer(slow);
    // Random seats read the log length; pick from the logged state for both.
    const action = pickAiAction(slow);
    slow = applyActionPure(slow, seat, action);
    fast = applyUnchecked(fast, seat, action);
    expect(withoutLog(fast)).toEqual(withoutLog(slow));
  }
  expect(slow.phase).toBe("game-over");
}

describe("search clone + applyUnchecked", () => {
  it("a clone equals structuredClone and shares no mutable arrays", () => {
    const s = createInitialState({ playerCount: 4, strategies: [null, null, null, null], seed: 3 });
    const c = cloneState(s);
    expect(withoutLog(c)).toEqual(withoutLog(structuredClone(s)));
    c.players[0].deck.push("x");
    c.track[0][0].push("y");
    c.crypts[Object.keys(c.crypts)[0]].push("z");
    expect(s.players[0].deck).not.toContain("x");
    expect(s.track[0][0]).not.toContain("y");
    expect(Object.values(s.crypts).flat()).not.toContain("z");
  });

  for (const n of [2, 3, 4, 5, 6]) {
    for (const mode of ["elder", "rookie"] as const) {
      it(`matches applyActionPure over whole ${n}p ${mode} games`, () => {
        for (const seed of [1, 2, 3]) playBoth(n, seed * 101 + n, mode);
      });
    }
  }
});
