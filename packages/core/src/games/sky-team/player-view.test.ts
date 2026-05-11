import { describe, expect, it } from "vitest";
import { applyReadyToRoll, rollDice } from "./game-engine";
import { buildPlayerView } from "./player-view";
import { createRng } from "./rng";
import { getScenario } from "./scenarios";
import { createGame } from "./setup";

const SCENARIO = getScenario("yul-montreal");

function newReady(seed = 42) {
  const rng = createRng(seed);
  const state = createGame({ scenario: SCENARIO, seed }, rng);
  let s = applyReadyToRoll(state, 0);
  s = applyReadyToRoll(s, 1);
  return rollDice(s, rng);
}

describe("buildPlayerView", () => {
  it("returns viewer's full dice (with values)", () => {
    const state = newReady();
    const view = buildPlayerView(state, 0);
    expect(view.myDice).toHaveLength(4);
    for (const d of view.myDice) {
      expect(d.value).toBeGreaterThanOrEqual(1);
      expect(d.value).toBeLessThanOrEqual(6);
      expect(d.color).toBe("blue");
    }
  });

  it("hides opponent dice values; only count is exposed", () => {
    const state = newReady();
    const view = buildPlayerView(state, 0);
    expect(view.opponentDiceCount).toBe(4);
    expect((view as { opponentDice?: unknown }).opponentDice).toBeUndefined();
  });

  it("symmetric — copilot view exposes copilot dice only", () => {
    const state = newReady();
    const view = buildPlayerView(state, 1);
    for (const d of view.myDice) expect(d.color).toBe("orange");
    expect(view.opponentDiceCount).toBe(4);
  });

  it("isYourTurn true for pilot in placement when toPlace=0", () => {
    const state = newReady();
    expect(buildPlayerView(state, 0).isYourTurn).toBe(true);
    expect(buildPlayerView(state, 1).isYourTurn).toBe(false);
  });

  it("isYourTurn true for both during briefing if neither ready", () => {
    const rng = createRng(1);
    const state = createGame({ scenario: SCENARIO, seed: 1 }, rng);
    expect(buildPlayerView(state, 0).isYourTurn).toBe(true);
    expect(buildPlayerView(state, 1).isYourTurn).toBe(true);
  });

  it("coffeeTokens, rerollTokens, axis, approach, altitude all visible to both", () => {
    const state = newReady();
    const v0 = buildPlayerView(state, 0);
    const v1 = buildPlayerView(state, 1);
    expect(v0.coffeeTokens).toBe(v1.coffeeTokens);
    expect(v0.rerollTokens).toBe(v1.rerollTokens);
    expect(v0.axis).toEqual(v1.axis);
    expect(v0.approach).toEqual(v1.approach);
    expect(v0.altitude).toEqual(v1.altitude);
  });

  it("placed dice in slots are visible to both with their values", () => {
    const state = newReady();
    const die = state.unplacedDice[0][0];
    const placedState = {
      ...state,
      slots: {
        ...state.slots,
        "pilot-axis": { ...state.slots["pilot-axis"], die: { ...die } },
      },
    };
    const v0 = buildPlayerView(placedState, 0);
    const v1 = buildPlayerView(placedState, 1);
    expect(v0.slots["pilot-axis"].die?.value).toBe(die.value);
    expect(v1.slots["pilot-axis"].die?.value).toBe(die.value);
  });
});
