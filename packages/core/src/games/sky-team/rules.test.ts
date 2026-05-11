import { describe, expect, it } from "vitest";
import { applyReadyToRoll, rollDice } from "./game-engine";
import { createRng } from "./rng";
import { getLegalActionsForPlayer, getLegalPlacements } from "./rules";
import { getScenario } from "./scenarios";
import { createGame } from "./setup";
import type { DieValue, PlayerIndex, SkyTeamGameState } from "./types";

const SCENARIO = getScenario("yul-montreal");

function newReady(seed = 42): SkyTeamGameState {
  const rng = createRng(seed);
  const state = createGame({ scenario: SCENARIO, seed }, rng);
  let s = applyReadyToRoll(state, 0);
  s = applyReadyToRoll(s, 1);
  return rollDice(s, rng);
}

function withHand(
  state: SkyTeamGameState,
  player: PlayerIndex,
  values: DieValue[],
): SkyTeamGameState {
  return {
    ...state,
    unplacedDice: [
      player === 0
        ? values.map((v, i) => ({
            id: 5000 + i,
            color: "blue",
            value: v,
            owner: 0,
            source: "rolled" as const,
          }))
        : state.unplacedDice[0],
      player === 1
        ? values.map((v, i) => ({
            id: 6000 + i,
            color: "orange",
            value: v,
            owner: 1,
            source: "rolled" as const,
          }))
        : state.unplacedDice[1],
    ],
  };
}

describe("getLegalActionsForPlayer", () => {
  it("returns ready-to-roll only in briefing for unready players", () => {
    const rng = createRng(1);
    const state = createGame({ scenario: SCENARIO, seed: 1 }, rng);
    expect(getLegalActionsForPlayer(state, 0)).toEqual([{ kind: "ready-to-roll" }]);
    const half = applyReadyToRoll(state, 0);
    expect(getLegalActionsForPlayer(half, 0)).toEqual([]);
    expect(getLegalActionsForPlayer(half, 1)).toEqual([{ kind: "ready-to-roll" }]);
  });

  it("returns empty when game is over", () => {
    const state = newReady();
    const over: SkyTeamGameState = { ...state, outcome: "win", phase: "game-over" };
    expect(getLegalActionsForPlayer(over, 0)).toEqual([]);
  });

  it("includes spend-reroll only for placement phase with rerollTokens > 0", () => {
    const state = newReady();
    expect(state.rerollTokens).toBeGreaterThan(0);
    const acts = getLegalActionsForPlayer(state, 0);
    expect(acts.some((a) => a.kind === "spend-reroll")).toBe(true);
    const noTokens: SkyTeamGameState = { ...state, rerollTokens: 0 };
    const acts2 = getLegalActionsForPlayer(noTokens, 0);
    expect(acts2.some((a) => a.kind === "spend-reroll")).toBe(false);
  });

  it("returns place-die candidates only for the active player", () => {
    const state = newReady();
    const pilot = getLegalActionsForPlayer(state, 0);
    const copilot = getLegalActionsForPlayer(state, 1);
    expect(pilot.some((a) => a.kind === "place-die")).toBe(true);
    expect(copilot.some((a) => a.kind === "place-die")).toBe(false);
  });
});

describe("getLegalPlacements", () => {
  it("only enumerates dice the player owns", () => {
    let s = newReady();
    s = withHand(s, 0, [1, 2, 3, 4]);
    const placements = getLegalPlacements(s, 0);
    const ownerIds = new Set(s.unplacedDice[0].map((d) => d.id));
    for (const p of placements) expect(ownerIds.has(p.dieId)).toBe(true);
  });

  it("excludes copilot-only slots for pilot", () => {
    let s = newReady();
    s = withHand(s, 0, [1, 2, 3, 4]);
    const placements = getLegalPlacements(s, 0);
    expect(placements.some((p) => p.slot === "copilot-axis")).toBe(false);
    expect(placements.some((p) => p.slot === "flaps-1")).toBe(false);
  });

  it("respects ordering for flaps and brakes", () => {
    let s = newReady();
    s = withHand(s, 1, [1, 2, 3, 4]);
    s = { ...s, toPlace: 1 };
    const placements = getLegalPlacements(s, 1);
    expect(placements.some((p) => p.slot === "flaps-1")).toBe(true);
    expect(placements.some((p) => p.slot === "flaps-2")).toBe(false);
  });

  it("respects allowedValues constraint (brakes-2 only accepts 2)", () => {
    let s = newReady();
    s = withHand(s, 0, [3, 5, 6, 1]);
    const placements = getLegalPlacements(s, 0);
    const brakeAttempts = placements.filter((p) => p.slot === "brakes-2");
    for (const p of brakeAttempts) expect(p.coffeeAdjust).not.toBe(0);
  });

  it("includes coffee-adjusted candidates when coffee tokens > 0", () => {
    let s = newReady();
    s = withHand(s, 0, [3, 5, 6, 1]);
    s = { ...s, coffeeTokens: 1 };
    const placements = getLegalPlacements(s, 0);
    const brakeWithAdjust = placements.find((p) => p.slot === "brakes-2" && p.coffeeAdjust === -1);
    expect(brakeWithAdjust).toBeDefined();
  });

  it("returns empty if not your turn", () => {
    const s = newReady();
    const placements = getLegalPlacements(s, 1);
    expect(placements).toEqual([]);
  });
});
