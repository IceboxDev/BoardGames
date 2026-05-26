import { describe, expect, it } from "vitest";
import { getStrategy, HEURISTIC_V1, STUB_AI } from "./ai-strategies";
import { applyReadyToRoll, rollDice } from "./game-engine";
import { buildPlayerView } from "./player-view";
import { createRng } from "./rng";
import { getLegalActionsForPlayer } from "./rules";
import { getScenario } from "./scenarios";
import { createGame } from "./setup";
import type { DieValue, PlayerIndex, SkyTeamGameState } from "./types";

const SCENARIO = getScenario("yul-montreal");

function setup(seed = 7): SkyTeamGameState {
  const rng = createRng(seed);
  let s = createGame({ scenario: SCENARIO, seed }, rng);
  s = applyReadyToRoll(s, 0);
  s = applyReadyToRoll(s, 1);
  return rollDice(s, rng);
}

function pinHand(
  state: SkyTeamGameState,
  player: PlayerIndex,
  values: DieValue[],
): SkyTeamGameState {
  return {
    ...state,
    unplacedDice: [
      player === 0
        ? values.map((v, i) => ({
            id: 9000 + i,
            color: "blue" as const,
            value: v,
            owner: 0 as PlayerIndex,
            source: "rolled" as const,
          }))
        : state.unplacedDice[0],
      player === 1
        ? values.map((v, i) => ({
            id: 9100 + i,
            color: "orange" as const,
            value: v,
            owner: 1 as PlayerIndex,
            source: "rolled" as const,
          }))
        : state.unplacedDice[1],
    ],
  };
}

describe("getStrategy", () => {
  it("returns the named strategy", () => {
    expect(getStrategy("stub").id).toBe("stub");
    expect(getStrategy("heuristic-v1").id).toBe("heuristic-v1");
  });

  it("throws on unknown id", () => {
    expect(() => getStrategy("nope")).toThrowError();
  });
});

describe("HEURISTIC_V1.pickAction", () => {
  it("auto-readies in briefing", () => {
    const rng = createRng(1);
    const s = createGame({ scenario: SCENARIO, seed: 1 }, rng);
    const view = buildPlayerView(s, 0);
    const legal = getLegalActionsForPlayer(s, 0);
    const action = HEURISTIC_V1.pickAction(view, legal, 0);
    expect(action.kind).toBe("ready-to-roll");
  });

  it("avoids spin: prefers safe axis pair over guaranteed crash", () => {
    let s = setup(42);
    s = pinHand(s, 0, [6, 6, 6, 6]);
    s = {
      ...s,
      axis: { position: 2, spinAt: 3 },
      slots: {
        ...s.slots,
        "copilot-axis": {
          ...s.slots["copilot-axis"],
          die: { id: 5, color: "orange", value: 1, owner: 1, source: "rolled" },
        },
      },
    };
    const view = buildPlayerView(s, 0);
    const legal = getLegalActionsForPlayer(s, 0);
    const action = HEURISTIC_V1.pickAction(view, legal, 0);
    expect(action.kind).toBe("place-die");
    if (action.kind === "place-die") expect(action.slot).not.toBe("pilot-axis");
  });

  it("with only one die left and mandatory unfilled, fills mandatory", () => {
    let s = setup(99);
    s = pinHand(s, 0, [3]);
    const view = buildPlayerView(s, 0);
    const legal = getLegalActionsForPlayer(s, 0);
    const action = HEURISTIC_V1.pickAction(view, legal, 0);
    expect(action.kind).toBe("place-die");
    if (action.kind === "place-die") {
      expect(["pilot-axis", "pilot-engine"]).toContain(action.slot);
    }
  });

  it("prefers safe engine over engine that causes collision", () => {
    let s = setup(2);
    s = pinHand(s, 0, [3, 3, 3, 3]);
    s = {
      ...s,
      approach: { current: 2, airportIndex: 6, airliners: [0, 0, 1, 0, 0, 0, 0] },
      slots: {
        ...s.slots,
        "copilot-engine": {
          ...s.slots["copilot-engine"],
          die: { id: 5, color: "orange", value: 3, owner: 1, source: "rolled" },
        },
      },
    };
    const view = buildPlayerView(s, 0);
    const legal = getLegalActionsForPlayer(s, 0);
    const action = HEURISTIC_V1.pickAction(view, legal, 0);
    expect(action.kind).toBe("place-die");
    if (action.kind === "place-die") expect(action.slot).not.toBe("pilot-engine");
  });
});

describe("STUB_AI.pickAction", () => {
  it("picks first place-die when available", () => {
    const s = setup(1);
    const view = buildPlayerView(s, 0);
    const legal = getLegalActionsForPlayer(s, 0);
    const action = STUB_AI.pickAction(view, legal, 0);
    expect(action.kind).toBe("place-die");
  });
});
