import { describe, expect, it } from "vitest";
import { pickAiAction } from "../ai-strategies";
import { applyUnchecked, createInitialState } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import type { GameState } from "../types";
import { outcomeUtility, playout } from "./rollout";
import { strigoiPick } from "./strigoi";

const CFG = { rollouts: 12, minPerArm: 1, timeMs: 0 };

function advance(s: GameState, steps: number): GameState {
  let cur = s;
  for (let i = 0; i < steps && cur.phase !== "game-over"; i++) {
    cur = applyUnchecked(cur, getActivePlayer(cur), pickAiAction(cur));
  }
  return cur;
}

function firstChoice(s: GameState): GameState {
  let cur = s;
  while (getLegalActions(cur, getActivePlayer(cur)).length < 2) cur = advance(cur, 1);
  return cur;
}

describe("strigoi", () => {
  const start = createInitialState({
    playerCount: 3,
    strategies: ["heuristic-v1", "heuristic-v1", "heuristic-v1"],
    seed: 42,
  });

  it("returns one of the legal actions, reproducibly", () => {
    const s = firstChoice(advance(start, 30));
    const seat = getActivePlayer(s);
    const legal = getLegalActions(s, seat);
    const a = strigoiPick(s, seat, legal, CFG);
    expect(legal).toContain(a);
    expect(strigoiPick(s, seat, legal, CFG)).toBe(a);
  });

  it("does not depend on the hidden cards", () => {
    const s = firstChoice(advance(start, 45));
    const seat = getActivePlayer(s);
    const t = structuredClone(s);
    t.huntDeck.reverse();
    const legalS = getLegalActions(s, seat);
    const legalT = getLegalActions(t, seat);
    const a = legalS.indexOf(strigoiPick(s, seat, legalS, CFG));
    const b = legalT.indexOf(strigoiPick(t, seat, legalT, CFG));
    expect(b).toBe(a);
  });

  it("scores a finished game in [0, 1], winners above losers", () => {
    const end = playout(start);
    const u = end.players.map((p) => outcomeUtility(end, p.index));
    for (const x of u) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of u) expect(x).toBeLessThanOrEqual(1);
    const w = end.result?.winners[0] ?? 0;
    expect(Math.max(...u)).toBe(u[w]);
  });
});
