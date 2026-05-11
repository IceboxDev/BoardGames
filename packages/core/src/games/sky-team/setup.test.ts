import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { BRAKES_ORDER, FLAPS_ORDER, getScenario, LANDING_GEAR_SLOTS } from "./scenarios";
import { createGame } from "./setup";
import { SLOT_IDS } from "./types";

describe("createGame", () => {
  const scenario = getScenario("yul-montreal");

  it("returns a valid initial state with all expected fields", () => {
    const state = createGame({ scenario, seed: 42 }, createRng(42));

    expect(state.scenario.id).toBe("yul-montreal");
    expect(state.round).toBe(1);
    expect(state.phase).toBe("briefing");
    expect(state.toPlace).toBe(0);
    expect(state.firstThisRound).toBe(0);
    expect(state.readyForRoll).toEqual([false, false]);
    expect(state.unplacedDice).toEqual([[], []]);
    expect(state.outcome).toBeNull();
    expect(state.isFinalRound).toBe(false);
    expect(state.finalRoundSpeed).toBeNull();
    expect(state.nextDieId).toBe(0);
    expect(state.seed).toBe(42);
  });

  it("initializes the speed gauge per scenario", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.speedGauge.bluePos).toBe(4);
    expect(state.speedGauge.orangePos).toBe(8);
  });

  it("initializes axis at 0 with the scenario's spin marker", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.axis.position).toBe(0);
    expect(state.axis.spinAt).toBe(scenario.axisSpinAt);
  });

  it("initializes the approach corridor at index 0 with airliners copied", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.approach.current).toBe(0);
    expect(state.approach.airportIndex).toBe(scenario.approach.airportIndex);
    expect(state.approach.airliners).toEqual(scenario.approach.airliners);
    expect(state.approach.airliners).not.toBe(scenario.approach.airliners);
  });

  it("initializes altitude at the scenario start", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.altitude.feet).toBe(6000);
    expect([...state.altitude.rerollAt]).toEqual([6000, 4000, 2000]);
  });

  it("collects a reroll token immediately if the starting altitude is marked", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.rerollTokens).toBe(1);
  });

  it("brake track starts empty", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.brakeTrack.pos).toBe(0);
  });

  it("creates a slot state entry for every SLOT_ID with no die", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    for (const id of SLOT_IDS) {
      expect(state.slots[id]).toBeDefined();
      expect(state.slots[id].id).toBe(id);
      expect(state.slots[id].die).toBeNull();
    }
  });

  it("gives gear/flaps/brakes slots a switchOn = false; others are undefined", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    const switchedSlots = new Set<string>([...LANDING_GEAR_SLOTS, ...FLAPS_ORDER, ...BRAKES_ORDER]);
    for (const id of SLOT_IDS) {
      if (switchedSlots.has(id)) {
        expect(state.slots[id].switchOn).toBe(false);
      } else {
        expect(state.slots[id].switchOn).toBeUndefined();
      }
    }
  });

  it("starts with no coffee tokens", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.coffeeTokens).toBe(0);
  });

  it("logs a round-start entry", () => {
    const state = createGame({ scenario, seed: 1 }, createRng(1));
    expect(state.log).toEqual([{ t: "round-start", round: 1, first: 0, rerollTokens: 1 }]);
  });

  it("is deterministic with the same seed", () => {
    const a = createGame({ scenario, seed: 12345 }, createRng(12345));
    const b = createGame({ scenario, seed: 12345 }, createRng(12345));
    expect(a).toEqual(b);
  });
});
