import { beforeEach, describe, expect, it } from "vitest";
import {
  applyAction,
  applyEndRound,
  applyReadyToRoll,
  applyReroll,
  InvalidActionError,
  isLegalPlacement,
  placementsExhausted,
  rollDice,
  shouldRollDice,
} from "./game-engine";
import { createRng, type Rng } from "./rng";
import { getScenario } from "./scenarios";
import { createGame } from "./setup";
import type { Die, DieValue, PlayerIndex, SkyTeamGameState, SlotId } from "./types";

const SCENARIO = getScenario("yul-montreal");

function newGame(seed = 42): { state: SkyTeamGameState; rng: Rng } {
  const rng = createRng(seed);
  return { state: createGame({ scenario: SCENARIO, seed }, rng), rng };
}

function readyAndRoll(seed = 42): { state: SkyTeamGameState; rng: Rng } {
  const { state, rng } = newGame(seed);
  let s = applyReadyToRoll(state, 0);
  s = applyReadyToRoll(s, 1);
  s = rollDice(s, rng);
  return { state: s, rng };
}

/**
 * Inject a known die into a player's hand at a known value, replacing whatever
 * the seeded roll produced. Used to set up deterministic placement scenarios.
 */
function setHand(
  state: SkyTeamGameState,
  player: PlayerIndex,
  values: DieValue[],
): SkyTeamGameState {
  const next = structuredClone(state);
  next.unplacedDice[player] = values.map((v, i) => ({
    id: 1000 + player * 100 + i,
    color: player === 0 ? "blue" : "orange",
    value: v,
    owner: player,
    source: "rolled",
  }));
  return next;
}

function place(
  state: SkyTeamGameState,
  player: PlayerIndex,
  slot: SlotId,
  value: DieValue,
  rng: Rng,
  coffeeAdjust = 0,
): SkyTeamGameState {
  const die = state.unplacedDice[player].find((d) => d.value === value);
  if (!die) throw new Error(`no die of value ${value} in player ${player}'s hand`);
  return applyAction(
    state,
    player,
    { kind: "place-die", dieId: die.id, slot, coffeeAdjust },
    { rng },
  );
}

describe("applyReadyToRoll", () => {
  it("flags the calling player ready", () => {
    const { state } = newGame();
    const next = applyReadyToRoll(state, 1);
    expect(next.readyForRoll).toEqual([false, true]);
  });

  it("rejects when not in briefing", () => {
    const { state, rng } = readyAndRoll();
    expect(() => applyReadyToRoll(state, 0)).toThrowError(InvalidActionError);
    void rng;
  });

  it("is idempotent", () => {
    const { state } = newGame();
    const a = applyReadyToRoll(state, 0);
    const b = applyReadyToRoll(a, 0);
    expect(b.readyForRoll).toEqual([true, false]);
  });
});

describe("rollDice", () => {
  it("rolls dicePerPlayer dice per player and transitions to placement", () => {
    const { state, rng } = newGame();
    const ready = applyReadyToRoll(applyReadyToRoll(state, 0), 1);
    const rolled = rollDice(ready, rng);
    expect(rolled.unplacedDice[0]).toHaveLength(4);
    expect(rolled.unplacedDice[1]).toHaveLength(4);
    expect(rolled.phase).toBe("placement");
    expect(rolled.toPlace).toBe(0);
  });

  it("assigns colour and owner correctly", () => {
    const { state } = readyAndRoll();
    for (const d of state.unplacedDice[0]) {
      expect(d.color).toBe("blue");
      expect(d.owner).toBe(0);
      expect(d.source).toBe("rolled");
    }
    for (const d of state.unplacedDice[1]) {
      expect(d.color).toBe("orange");
      expect(d.owner).toBe(1);
    }
  });

  it("advances nextDieId", () => {
    const { state } = readyAndRoll();
    expect(state.nextDieId).toBe(8);
    const ids = [...state.unplacedDice[0], ...state.unplacedDice[1]].map((d) => d.id);
    expect(new Set(ids).size).toBe(8);
  });
});

describe("shouldRollDice / placementsExhausted", () => {
  it("shouldRollDice once both ready", () => {
    const { state } = newGame();
    expect(shouldRollDice(state)).toBe(false);
    expect(shouldRollDice(applyReadyToRoll(state, 0))).toBe(false);
    expect(shouldRollDice(applyReadyToRoll(applyReadyToRoll(state, 0), 1))).toBe(true);
  });

  it("placementsExhausted only when both hands empty during placement", () => {
    const { state } = readyAndRoll();
    expect(placementsExhausted(state)).toBe(false);
    const empty: SkyTeamGameState = { ...state, unplacedDice: [[], []] };
    expect(placementsExhausted(empty)).toBe(true);
  });
});

describe("applyReroll", () => {
  it("rejects when no reroll tokens", () => {
    let s = readyAndRoll().state;
    s = { ...s, rerollTokens: 0 };
    const id = s.unplacedDice[0][0].id;
    expect(() => applyReroll(s, [id], [], createRng(1))).toThrowError(InvalidActionError);
  });

  it("rejects when nothing selected", () => {
    const s = readyAndRoll().state;
    expect(() => applyReroll(s, [], [], createRng(1))).toThrowError(InvalidActionError);
  });

  it("rerolls only listed dice; decrements token", () => {
    const { state } = readyAndRoll();
    const id = state.unplacedDice[0][0].id;
    const rerolled = applyReroll(state, [id], [], createRng(123));
    expect(rerolled.rerollTokens).toBe(state.rerollTokens - 1);
    const target = rerolled.unplacedDice[0].find((d) => d.id === id);
    expect(target?.source).toBe("rerolled");
    const others = rerolled.unplacedDice[0].filter((d) => d.id !== id);
    for (const o of others) expect(o.source).toBe("rolled");
  });

  it("rejects unknown die ids", () => {
    const { state } = readyAndRoll();
    expect(() => applyReroll(state, [99999], [], createRng(1))).toThrowError(InvalidActionError);
  });
});

describe("place-die — eligibility, ordering, capacity", () => {
  let state: SkyTeamGameState;
  let rng: Rng;

  beforeEach(() => {
    const r = readyAndRoll();
    state = setHand(r.state, 0, [1, 2, 3, 4]);
    state = setHand(state, 1, [1, 2, 3, 4]);
    rng = r.rng;
  });

  it("rejects pilot placing in copilot-only slot", () => {
    expect(() => place(state, 0, "copilot-axis", 3, rng)).toThrowError(InvalidActionError);
  });

  it("rejects copilot placing in pilot-only slot", () => {
    state = { ...state, toPlace: 1 };
    expect(() => place(state, 1, "pilot-axis", 3, rng)).toThrowError(InvalidActionError);
  });

  it("rejects placing into a full slot", () => {
    let s = place(state, 0, "pilot-axis", 1, rng);
    s = { ...s, toPlace: 0 };
    expect(() => place(s, 0, "pilot-axis", 2, rng)).toThrowError(InvalidActionError);
  });

  it("rejects when not your turn", () => {
    expect(() => place(state, 1, "copilot-axis", 3, rng)).toThrowError(InvalidActionError);
  });

  it("rejects when value violates allowedValues constraint", () => {
    expect(() => place(state, 0, "brakes-2", 1, rng)).toThrowError(InvalidActionError);
  });

  it("accepts brakes-2 with exact value 2", () => {
    const s = place(state, 0, "brakes-2", 2, rng);
    expect(s.slots["brakes-2"].die?.value).toBe(2);
    expect(s.slots["brakes-2"].switchOn).toBe(true);
    expect(s.brakeTrack.pos).toBe(1);
  });

  it("rejects brakes-4 before brakes-2", () => {
    expect(() => place(state, 0, "brakes-4", 4, rng)).toThrowError(InvalidActionError);
  });

  it("rejects flaps-2 before flaps-1", () => {
    state = { ...state, toPlace: 1 };
    expect(() => place(state, 1, "flaps-2", 2, rng)).toThrowError(InvalidActionError);
  });

  it("alternates toPlace after a successful placement when the other has dice", () => {
    const s = place(state, 0, "pilot-axis", 1, rng);
    expect(s.toPlace).toBe(1);
  });

  it("keeps toPlace on the same player when the other has no dice left", () => {
    let s = setHand(state, 1, []);
    s = place(s, 0, "pilot-axis", 1, rng);
    expect(s.toPlace).toBe(0);
  });
});

describe("axis effect", () => {
  it("does nothing until both axis dice placed", () => {
    const { state, rng } = readyAndRoll();
    let s = setHand(state, 0, [3, 1, 1, 1]);
    s = setHand(s, 1, [3, 1, 1, 1]);
    s = place(s, 0, "pilot-axis", 3, rng);
    expect(s.axis.position).toBe(0);
  });

  it("moves axis by signed difference; toward player with higher die", () => {
    const { state, rng } = readyAndRoll();
    let s = setHand(state, 0, [5, 1, 1, 1]);
    s = setHand(s, 1, [3, 1, 1, 1]);
    s = place(s, 0, "pilot-axis", 5, rng);
    s = place(s, 1, "copilot-axis", 3, rng);
    expect(s.axis.position).toBe(2);
  });

  it("does nothing when axis dice equal", () => {
    const { state, rng } = readyAndRoll();
    let s = setHand(state, 0, [4, 1, 1, 1]);
    s = setHand(s, 1, [4, 1, 1, 1]);
    s = place(s, 0, "pilot-axis", 4, rng);
    s = place(s, 1, "copilot-axis", 4, rng);
    expect(s.axis.position).toBe(0);
  });

  it("triggers loss-spin when |axis| reaches spinAt", () => {
    const { state, rng } = readyAndRoll();
    let s = setHand(state, 0, [6, 1, 1, 1]);
    s = setHand(s, 1, [2, 1, 1, 1]);
    s = place(s, 0, "pilot-axis", 6, rng);
    s = place(s, 1, "copilot-axis", 2, rng);
    expect(s.outcome).toBe("loss-spin");
    expect(s.phase).toBe("game-over");
  });

  it("axis is cumulative across placements (no reset)", () => {
    const { state } = readyAndRoll();
    const s: SkyTeamGameState = { ...state, axis: { ...state.axis, position: 1 } };
    let s2 = setHand(s, 0, [5, 1, 1, 1]);
    s2 = setHand(s2, 1, [3, 1, 1, 1]);
    s2 = place(s2, 0, "pilot-axis", 5, createRng(1));
    s2 = place(s2, 1, "copilot-axis", 3, createRng(1));
    expect(s2.axis.position).toBe(3);
  });
});

describe("engine effect (non-final round)", () => {
  it("does not advance approach when speed below blue threshold", () => {
    const { state } = readyAndRoll();
    let s = setHand(state, 0, [1, 1, 1, 1]);
    s = setHand(s, 1, [1, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 1, createRng(1));
    s = place(s, 1, "copilot-engine", 1, createRng(1));
    expect(s.approach.current).toBe(0);
  });

  it("advances 1 when speed within markers", () => {
    const { state } = readyAndRoll();
    let s = setHand(state, 0, [3, 1, 1, 1]);
    s = setHand(s, 1, [3, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 3, createRng(1));
    s = place(s, 1, "copilot-engine", 3, createRng(1));
    expect(s.approach.current).toBe(1);
  });

  it("advances 2 when speed exceeds orange threshold", () => {
    const { state } = readyAndRoll();
    let s = setHand(state, 0, [6, 1, 1, 1]);
    s = setHand(s, 1, [6, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 6, createRng(1));
    s = place(s, 1, "copilot-engine", 6, createRng(1));
    expect(s.approach.current).toBe(2);
  });

  it("triggers loss-collision if airliner sits at current position when advancing", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = {
      ...state,
      approach: { ...state.approach, current: 2, airliners: [0, 0, 1, 0, 1, 1, 1, 1, 0] },
    };
    s = setHand(s, 0, [6, 1, 1, 1]);
    s = setHand(s, 1, [6, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 6, rng);
    s = place(s, 1, "copilot-engine", 6, rng);
    expect(s.outcome).toBe("loss-collision");
  });

  it("triggers loss-overshoot if at airport and advancing", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = {
      ...state,
      approach: { ...state.approach, current: state.approach.airportIndex },
    };
    s = setHand(s, 0, [3, 1, 1, 1]);
    s = setHand(s, 1, [3, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 3, rng);
    s = place(s, 1, "copilot-engine", 3, rng);
    expect(s.outcome).toBe("loss-overshoot");
  });
});

describe("engine effect (final round)", () => {
  it("loss-overrun when speed >= brake threshold", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = { ...state, isFinalRound: true, brakeTrack: { pos: 0 } };
    s = setHand(s, 0, [1, 1, 1, 1]);
    s = setHand(s, 1, [1, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 1, rng);
    s = place(s, 1, "copilot-engine", 1, rng);
    expect(s.outcome).toBe("loss-overrun");
  });

  it("no overrun when speed < brake threshold; sets finalRoundSpeed", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = { ...state, isFinalRound: true, brakeTrack: { pos: 3 } };
    s = setHand(s, 0, [1, 1, 1, 1]);
    s = setHand(s, 1, [1, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 1, rng);
    s = place(s, 1, "copilot-engine", 1, rng);
    expect(s.outcome).toBeNull();
    expect(s.finalRoundSpeed).toBe(2);
  });

  it("does NOT advance approach in final round", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = { ...state, isFinalRound: true, brakeTrack: { pos: 5 } };
    s = setHand(s, 0, [1, 1, 1, 1]);
    s = setHand(s, 1, [1, 1, 1, 1]);
    s = place(s, 0, "pilot-engine", 1, rng);
    s = place(s, 1, "copilot-engine", 1, rng);
    expect(s.approach.current).toBe(0);
  });
});

describe("radio effect", () => {
  it("removes one airliner at current+value-1", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = {
      ...state,
      approach: { ...state.approach, airliners: [0, 0, 1, 0, 1, 1, 1, 1, 0] },
    };
    s = setHand(s, 0, [3, 1, 1, 1]);
    s = place(s, 0, "pilot-radio", 3, rng);
    expect(s.approach.airliners[2]).toBe(0);
  });

  it("does nothing if no airliner at target", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = {
      ...state,
      approach: { ...state.approach, airliners: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    };
    s = setHand(s, 0, [3, 1, 1, 1]);
    s = place(s, 0, "pilot-radio", 3, rng);
    expect(s.approach.airliners.every((c) => c === 0)).toBe(true);
  });

  it("does nothing if target outside corridor", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = {
      ...state,
      approach: { ...state.approach, current: 7, airliners: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    };
    s = setHand(s, 0, [6, 1, 1, 1]);
    s = place(s, 0, "pilot-radio", 6, rng);
    expect(s.outcome).toBeNull();
  });
});

describe("landing gear effect", () => {
  it("turns switch on, advances blue marker", () => {
    const { state, rng } = readyAndRoll();
    let s = setHand(state, 0, [3, 1, 1, 1]);
    s = place(s, 0, "landing-gear-1", 3, rng);
    expect(s.slots["landing-gear-1"].switchOn).toBe(true);
    expect(s.speedGauge.bluePos).toBe(5);
  });
});

describe("flaps effect", () => {
  it("turns switch on in order, advances orange marker", () => {
    const { state, rng } = readyAndRoll();
    const s = setHand(state, 1, [1, 2, 3, 4]);
    const after = applyAction(
      { ...s, toPlace: 1 },
      1,
      { kind: "place-die", dieId: s.unplacedDice[1][0].id, slot: "flaps-1", coffeeAdjust: 0 },
      { rng },
    );
    expect(after.slots["flaps-1"].switchOn).toBe(true);
    expect(after.speedGauge.orangePos).toBe(9);
  });
});

describe("brakes effect", () => {
  it("must deploy in order; advances brake marker", () => {
    const { state, rng } = readyAndRoll();
    let s = setHand(state, 0, [2, 4, 6, 1]);
    s = place(s, 0, "brakes-2", 2, rng);
    expect(s.brakeTrack.pos).toBe(1);
    s = { ...s, toPlace: 0 };
    s = place(s, 0, "brakes-4", 4, rng);
    expect(s.brakeTrack.pos).toBe(2);
  });
});

describe("concentration effect", () => {
  it("adds 1 coffee token, capped at 3", () => {
    const { state, rng } = readyAndRoll();
    let s = setHand(state, 0, [1, 2, 3, 4]);
    s = place(s, 0, "concentration-1", 1, rng);
    expect(s.coffeeTokens).toBe(1);
  });

  it("does not increase past cap", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = { ...state, coffeeTokens: 3 };
    s = setHand(s, 0, [1, 2, 3, 4]);
    s = place(s, 0, "concentration-1", 1, rng);
    expect(s.coffeeTokens).toBe(3);
  });
});

describe("coffee adjust on placement", () => {
  it("modifies value within 1..6, deducts tokens", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = { ...state, coffeeTokens: 2 };
    s = setHand(s, 0, [4, 1, 1, 1]);
    const die = s.unplacedDice[0][0];
    s = applyAction(
      s,
      0,
      { kind: "place-die", dieId: die.id, slot: "brakes-2", coffeeAdjust: -2 },
      { rng },
    );
    expect(s.slots["brakes-2"].die?.value).toBe(2);
    expect(s.coffeeTokens).toBe(0);
  });

  it("rejects when not enough coffee", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = { ...state, coffeeTokens: 1 };
    s = setHand(s, 0, [4, 1, 1, 1]);
    const die = s.unplacedDice[0][0];
    expect(() =>
      applyAction(
        s,
        0,
        { kind: "place-die", dieId: die.id, slot: "brakes-2", coffeeAdjust: -2 },
        { rng },
      ),
    ).toThrowError(InvalidActionError);
  });

  it("rejects when adjusted value is illegal for the slot", () => {
    const { state, rng } = readyAndRoll();
    let s: SkyTeamGameState = { ...state, coffeeTokens: 1 };
    s = setHand(s, 0, [3, 1, 1, 1]);
    const die = s.unplacedDice[0][0];
    expect(() =>
      applyAction(
        s,
        0,
        { kind: "place-die", dieId: die.id, slot: "brakes-2", coffeeAdjust: -2 },
        { rng },
      ),
    ).toThrowError(InvalidActionError);
  });
});

describe("end of round", () => {
  it("loss-mandatory if any axis or engine slot empty at round end", () => {
    const { state } = readyAndRoll();
    const next = applyEndRound({ ...state, unplacedDice: [[], []] });
    expect(next.outcome).toBe("loss-mandatory");
  });

  it("descends altitude by 1000 and clears non-persistent slots", () => {
    let s = readyAndRoll().state;
    s = setHand(s, 0, [3, 3, 3, 3]);
    s = setHand(s, 1, [3, 3, 3, 3]);
    s = place(s, 0, "pilot-axis", 3, createRng(1));
    s = place(s, 1, "copilot-axis", 3, createRng(1));
    s = place(s, 0, "pilot-engine", 3, createRng(1));
    s = place(s, 1, "copilot-engine", 3, createRng(1));
    s = setHand(s, 0, []);
    s = setHand(s, 1, []);
    const ended = applyEndRound(s);
    expect(ended.outcome).toBeNull();
    expect(ended.altitude.feet).toBe(5000);
    expect(ended.slots["pilot-axis"].die).toBeNull();
    expect(ended.slots["copilot-axis"].die).toBeNull();
    expect(ended.slots["pilot-engine"].die).toBeNull();
    expect(ended.slots["copilot-engine"].die).toBeNull();
    expect(ended.round).toBe(2);
    expect(ended.phase).toBe("briefing");
    expect(ended.readyForRoll).toEqual([false, false]);
  });

  it("collects a reroll token when descending into a marked altitude", () => {
    let s = readyAndRoll().state;
    s = setHand(s, 0, [3, 3, 3, 3]);
    s = setHand(s, 1, [3, 3, 3, 3]);
    s = place(s, 0, "pilot-axis", 3, createRng(1));
    s = place(s, 1, "copilot-axis", 3, createRng(1));
    s = place(s, 0, "pilot-engine", 3, createRng(1));
    s = place(s, 1, "copilot-engine", 3, createRng(1));
    s = setHand(s, 0, []);
    s = setHand(s, 1, []);
    s = { ...s, altitude: { ...s.altitude, feet: 5000 } };
    const beforeTokens = s.rerollTokens;
    const ended = applyEndRound(s);
    expect(ended.altitude.feet).toBe(4000);
    expect(ended.rerollTokens).toBe(beforeTokens + 1);
  });

  it("loss-undershoot when altitude bottoms before reaching airport", () => {
    let s = readyAndRoll().state;
    s = setHand(s, 0, [3, 3, 3, 3]);
    s = setHand(s, 1, [3, 3, 3, 3]);
    s = place(s, 0, "pilot-axis", 3, createRng(1));
    s = place(s, 1, "copilot-axis", 3, createRng(1));
    s = place(s, 0, "pilot-engine", 3, createRng(1));
    s = place(s, 1, "copilot-engine", 3, createRng(1));
    s = setHand(s, 0, []);
    s = setHand(s, 1, []);
    s = { ...s, altitude: { ...s.altitude, feet: 1000 }, approach: { ...s.approach, current: 3 } };
    const ended = applyEndRound(s);
    expect(ended.outcome).toBe("loss-undershoot");
  });

  it("sets isFinalRound when altitude bottoms AND at airport", () => {
    let s = readyAndRoll().state;
    s = setHand(s, 0, [3, 3, 3, 3]);
    s = setHand(s, 1, [3, 3, 3, 3]);
    s = place(s, 0, "pilot-axis", 3, createRng(1));
    s = place(s, 1, "copilot-axis", 3, createRng(1));
    s = place(s, 0, "pilot-engine", 3, createRng(1));
    s = place(s, 1, "copilot-engine", 3, createRng(1));
    s = setHand(s, 0, []);
    s = setHand(s, 1, []);
    s = {
      ...s,
      altitude: { ...s.altitude, feet: 1000 },
      approach: { ...s.approach, current: s.approach.airportIndex },
    };
    const ended = applyEndRound(s);
    expect(ended.outcome).toBeNull();
    expect(ended.isFinalRound).toBe(true);
  });
});

describe("final-round victory check", () => {
  function finalRoundFixture(overrides: Partial<SkyTeamGameState> = {}): SkyTeamGameState {
    let s = readyAndRoll().state;
    s = setHand(s, 0, [1, 1, 1, 1]);
    s = setHand(s, 1, [1, 1, 1, 1]);
    s = place(s, 0, "pilot-axis", 1, createRng(1));
    s = place(s, 1, "copilot-axis", 1, createRng(1));
    s = place(s, 0, "pilot-engine", 1, createRng(1));
    s = place(s, 1, "copilot-engine", 1, createRng(1));
    s = setHand(s, 0, []);
    s = setHand(s, 1, []);
    return {
      ...s,
      isFinalRound: true,
      approach: { ...s.approach, airliners: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
      slots: {
        ...s.slots,
        "landing-gear-1": { ...s.slots["landing-gear-1"], switchOn: true },
        "landing-gear-2": { ...s.slots["landing-gear-2"], switchOn: true },
        "landing-gear-3": { ...s.slots["landing-gear-3"], switchOn: true },
        "flaps-1": { ...s.slots["flaps-1"], switchOn: true },
        "flaps-2": { ...s.slots["flaps-2"], switchOn: true },
        "flaps-3": { ...s.slots["flaps-3"], switchOn: true },
      },
      ...overrides,
    };
  }

  it("win when all conditions met", () => {
    const s = finalRoundFixture();
    const out = applyEndRound(s);
    expect(out.outcome).toBe("win");
  });

  it("loss-airliners-remain when airliners on track", () => {
    const s = finalRoundFixture({
      approach: { current: 0, airportIndex: 8, airliners: [0, 0, 0, 0, 0, 0, 0, 0, 1] },
    });
    const out = applyEndRound(s);
    expect(out.outcome).toBe("loss-airliners-remain");
  });

  it("loss-gear-or-flaps when any switch off", () => {
    const baseline = finalRoundFixture();
    const s: SkyTeamGameState = {
      ...baseline,
      slots: {
        ...baseline.slots,
        "landing-gear-1": { ...baseline.slots["landing-gear-1"], switchOn: false },
      },
    };
    const out = applyEndRound(s);
    expect(out.outcome).toBe("loss-gear-or-flaps");
  });

  it("loss-axis-not-level when axis != 0", () => {
    const s = finalRoundFixture({ axis: { position: 1, spinAt: 4 } });
    const out = applyEndRound(s);
    expect(out.outcome).toBe("loss-axis-not-level");
  });
});

describe("isLegalPlacement", () => {
  it("rejects orange die into pilot-only slot", () => {
    const { state } = readyAndRoll();
    expect(isLegalPlacement(state, 1, "pilot-axis", 3)).toBe(false);
  });

  it("accepts blue die into pilot-axis", () => {
    const { state } = readyAndRoll();
    expect(isLegalPlacement(state, 0, "pilot-axis", 3)).toBe(true);
  });

  it("accepts both players in concentration", () => {
    const { state } = readyAndRoll();
    expect(isLegalPlacement(state, 0, "concentration-1", 5)).toBe(true);
    expect(isLegalPlacement(state, 1, "concentration-1", 5)).toBe(true);
  });
});

describe("die value typing helpers", () => {
  it("die ids are unique across rolls", () => {
    const { state, rng } = readyAndRoll();
    const second = rollDice({ ...state, unplacedDice: [[], []] }, rng);
    const allIds = [
      ...state.unplacedDice[0],
      ...state.unplacedDice[1],
      ...second.unplacedDice[0],
      ...second.unplacedDice[1],
    ].map((d: Die) => d.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
