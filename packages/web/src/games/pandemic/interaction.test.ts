import type {
  GameState,
  LegalAction,
  PlayerCard,
  PlayerState,
  Role,
} from "@boardgames/core/games/pandemic/types";
import { describe, expect, it } from "vitest";
import { deriveLegalDestinations, pickTreatDiseaseAction, resolveCityClick } from "./interaction";

// ── Fixtures ─────────────────────────────────────────────────────────────
//
// The interaction helpers only read a thin slice of `GameState`. Building
// the slice by hand keeps the tests fast and decoupled from the engine's
// setup pipeline — same approach the other targeted helpers in this
// package follow.

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 0,
    role: "medic" satisfies Role,
    hand: [],
    location: "Atlanta",
    usedOpsExpertMove: false,
    ...overrides,
  };
}

function stateWith(overrides: Partial<GameState> = {}): GameState {
  // The helpers only ever access a known subset (players, phase, cityCubes,
  // currentPlayerIndex). Other fields stay as cheap placeholders so the
  // type still resolves to a full GameState.
  return {
    cityCubes: {
      Atlanta: { blue: 0, yellow: 0, black: 0, red: 0 },
      Chicago: { blue: 0, yellow: 0, black: 0, red: 0 },
    },
    researchStations: ["Atlanta"],
    diseaseCubeSupply: { blue: 24, yellow: 24, black: 24, red: 24 },
    diseaseStatus: { blue: "active", yellow: "active", black: "active", red: "active" },
    outbreakCount: 0,
    infectionRateIndex: 0,
    playerDeck: [],
    playerDiscard: [],
    infectionDeck: [],
    infectionDiscard: [],
    players: [player()],
    currentPlayerIndex: 0,
    actionsRemaining: 4,
    phase: "actions",
    contingencyCard: null,
    skipNextInfect: false,
    pendingEpidemics: 0,
    preForecastPhase: null,
    discardingPlayerIndex: null,
    preDiscardPhase: null,
    difficulty: 4,
    result: null,
    turnNumber: 1,
    log: [],
    actionLog: [],
    ...overrides,
  };
}

// ── resolveCityClick ────────────────────────────────────────────────────

describe("resolveCityClick — normal mode", () => {
  it("returns null when not in the actions phase", () => {
    const state = stateWith({ phase: "draw" });
    const click = resolveCityClick("Chicago", state, [], { kind: "normal" });
    expect(click).toBeNull();
  });

  it("dispatches drive_ferry when the clicked city is a neighbor", () => {
    const legal: LegalAction[] = [{ kind: "drive_ferry", to: "Chicago" }];
    const click = resolveCityClick("Chicago", stateWith(), legal, { kind: "normal" });
    expect(click).toEqual({ kind: "drive_ferry", to: "Chicago" });
  });

  it("prefers drive_ferry over shuttle when both are legal to the same city", () => {
    const legal: LegalAction[] = [
      { kind: "drive_ferry", to: "Chicago" },
      { kind: "shuttle_flight", to: "Chicago" },
    ];
    const click = resolveCityClick("Chicago", stateWith(), legal, { kind: "normal" });
    expect(click).toEqual({ kind: "drive_ferry", to: "Chicago" });
  });

  it("falls through to shuttle when drive_ferry isn't legal", () => {
    const legal: LegalAction[] = [{ kind: "shuttle_flight", to: "Chicago" }];
    const click = resolveCityClick("Chicago", stateWith(), legal, { kind: "normal" });
    expect(click).toEqual({ kind: "shuttle_flight", to: "Chicago" });
  });

  it("dispatches direct_flight when the player holds the matching city card", () => {
    const hand: PlayerCard[] = [{ kind: "city", cityId: "Chicago", color: "blue" }];
    const state = stateWith({ players: [player({ hand })] });
    const legal: LegalAction[] = [{ kind: "direct_flight", cardIdx: 0 }];
    const click = resolveCityClick("Chicago", state, legal, { kind: "normal" });
    expect(click).toEqual({ kind: "direct_flight", cardIdx: 0 });
  });

  it("returns null when no movement to that city is legal", () => {
    const legal: LegalAction[] = [{ kind: "drive_ferry", to: "Miami" }];
    const click = resolveCityClick("Tokyo", stateWith(), legal, { kind: "normal" });
    expect(click).toBeNull();
  });
});

describe("resolveCityClick — select_destination mode", () => {
  it("resolves a charter_flight pick into the concrete action", () => {
    const click = resolveCityClick("Madrid", stateWith(), [], {
      kind: "select_destination",
      action: "charter_flight",
      destinations: new Set(["Madrid", "Paris"]),
    });
    expect(click).toEqual({ kind: "charter_flight", to: "Madrid" });
  });

  it("resolves an ops_move pick, carrying the chosen card index through", () => {
    const click = resolveCityClick("Madrid", stateWith(), [], {
      kind: "select_destination",
      action: "ops_move",
      cardIdx: 3,
      destinations: new Set(["Madrid"]),
    });
    expect(click).toEqual({ kind: "ops_move", to: "Madrid", cardIdx: 3 });
  });

  it("ignores clicks outside the destination set", () => {
    const click = resolveCityClick("Tokyo", stateWith(), [], {
      kind: "select_destination",
      action: "charter_flight",
      destinations: new Set(["Madrid"]),
    });
    expect(click).toBeNull();
  });
});

// ── deriveLegalDestinations ──────────────────────────────────────────────

describe("deriveLegalDestinations", () => {
  it("returns the destination set verbatim while in select_destination mode", () => {
    const dests = deriveLegalDestinations([], [], {
      kind: "select_destination",
      action: "charter_flight",
      destinations: new Set(["Madrid", "Paris"]),
    });
    expect(dests).toEqual(new Set(["Madrid", "Paris"]));
  });

  it("unions drive_ferry + shuttle + direct_flight cities in normal mode", () => {
    const hand: PlayerCard[] = [
      { kind: "city", cityId: "Tokyo", color: "red" },
      { kind: "event", event: "one_quiet_night" },
    ];
    const legal: LegalAction[] = [
      { kind: "drive_ferry", to: "Chicago" },
      { kind: "drive_ferry", to: "Miami" },
      { kind: "shuttle_flight", to: "Beijing" },
      { kind: "direct_flight", cardIdx: 0 }, // Tokyo
      { kind: "direct_flight", cardIdx: 1 }, // event card — no city, skip
    ];
    expect(deriveLegalDestinations(legal, hand, { kind: "normal" })).toEqual(
      new Set(["Chicago", "Miami", "Beijing", "Tokyo"]),
    );
  });

  it("ignores legal actions that aren't movement actions", () => {
    const legal: LegalAction[] = [
      { kind: "pass" },
      { kind: "build_station" },
      { kind: "treat_disease", color: "blue" },
    ];
    expect(deriveLegalDestinations(legal, [], { kind: "normal" })).toEqual(new Set());
  });
});

// ── pickTreatDiseaseAction ───────────────────────────────────────────────

describe("pickTreatDiseaseAction", () => {
  it("returns null when no treat action is legal", () => {
    expect(pickTreatDiseaseAction(stateWith(), [])).toBeNull();
  });

  it("returns the only legal treat when there is exactly one", () => {
    const legal: LegalAction[] = [{ kind: "treat_disease", color: "blue" }];
    expect(pickTreatDiseaseAction(stateWith(), legal)).toEqual({
      kind: "treat_disease",
      color: "blue",
    });
  });

  it("picks the color with the most cubes when multiple are legal", () => {
    const legal: LegalAction[] = [
      { kind: "treat_disease", color: "blue" },
      { kind: "treat_disease", color: "yellow" },
      { kind: "treat_disease", color: "red" },
    ];
    const state = stateWith({
      cityCubes: {
        Atlanta: { blue: 1, yellow: 3, black: 0, red: 2 },
      },
    });
    expect(pickTreatDiseaseAction(state, legal)).toEqual({
      kind: "treat_disease",
      color: "yellow",
    });
  });

  it("falls back to blue when every color is tied at zero (the helper's default)", () => {
    const legal: LegalAction[] = [
      { kind: "treat_disease", color: "blue" },
      { kind: "treat_disease", color: "red" },
    ];
    expect(pickTreatDiseaseAction(stateWith(), legal)).toEqual({
      kind: "treat_disease",
      color: "blue",
    });
  });
});
