import type {
  EventCard,
  GameState,
  LegalAction,
  PlayerCard,
  PlayerState,
  Role,
} from "@boardgames/core/games/pandemic/types";
import { describe, expect, it } from "vitest";
import { deriveActionButtons } from "./action-buttons";

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
  return {
    cityCubes: {},
    researchStations: [],
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

describe("deriveActionButtons", () => {
  it("returns an empty array outside the actions phase", () => {
    expect(deriveActionButtons(stateWith({ phase: "draw" }), [])).toEqual([]);
    expect(deriveActionButtons(stateWith({ phase: "infect" }), [])).toEqual([]);
    expect(deriveActionButtons(stateWith({ phase: "game_over" }), [])).toEqual([]);
  });

  it("always renders the nine default buttons in actions phase", () => {
    const buttons = deriveActionButtons(stateWith(), []);
    expect(buttons.map((b) => b.actionKind)).toEqual([
      "drive_ferry",
      "direct_flight",
      "charter_flight",
      "shuttle_flight",
      "build_station",
      "treat_disease",
      "share_give",
      "discover_cure",
      "pass",
    ]);
  });

  it("`enabled` reflects whether the legal-action set contains a matching kind", () => {
    const legal: LegalAction[] = [
      { kind: "drive_ferry", to: "Chicago" },
      { kind: "treat_disease", color: "blue" },
    ];
    const buttons = deriveActionButtons(stateWith(), legal);
    expect(buttons.find((b) => b.actionKind === "drive_ferry")?.enabled).toBe(true);
    expect(buttons.find((b) => b.actionKind === "treat_disease")?.enabled).toBe(true);
    expect(buttons.find((b) => b.actionKind === "direct_flight")?.enabled).toBe(false);
    expect(buttons.find((b) => b.actionKind === "discover_cure")?.enabled).toBe(false);
    // `pass` is always enabled.
    expect(buttons.find((b) => b.actionKind === "pass")?.enabled).toBe(true);
  });

  it("Share Knowledge is enabled when either give or take is legal", () => {
    const onlyTake: LegalAction[] = [{ kind: "share_take", fromId: 1, cardIdx: 0 }];
    expect(
      deriveActionButtons(stateWith(), onlyTake).find((b) => b.actionKind === "share_give")
        ?.enabled,
    ).toBe(true);
  });

  it("inserts Ops Expert Move next to the movement buttons", () => {
    const legal: LegalAction[] = [{ kind: "ops_move", cardIdx: 0, destinations: ["Madrid"] }];
    const state = stateWith({ players: [player({ role: "operations_expert" })] });
    const labels = deriveActionButtons(state, legal).map((b) => b.actionKind);
    const opsIdx = labels.indexOf("ops_move");
    expect(opsIdx).toBeGreaterThan(-1);
    // Sits between shuttle_flight (index 3) and build_station (index 5).
    expect(labels[opsIdx - 1]).toBe("shuttle_flight");
    expect(labels[opsIdx + 1]).toBe("build_station");
  });

  it("does NOT insert Ops Expert Move for a non-ops-expert role", () => {
    const legal: LegalAction[] = [{ kind: "ops_move", cardIdx: 0, destinations: ["Madrid"] }];
    const labels = deriveActionButtons(stateWith(), legal).map((b) => b.actionKind);
    expect(labels).not.toContain("ops_move");
  });

  it("inserts Dispatch to Pawn for the dispatcher", () => {
    const legal: LegalAction[] = [{ kind: "dispatcher_move_to_pawn", targetId: 1, toPlayerId: 0 }];
    const state = stateWith({ players: [player({ role: "dispatcher" })] });
    expect(
      deriveActionButtons(state, legal).find((b) => b.actionKind === "dispatcher_move_to_pawn"),
    ).toBeDefined();
  });

  it("inserts Store Event for the contingency planner when contingency_take is legal", () => {
    const legal: LegalAction[] = [{ kind: "contingency_take", discardIdx: 0 }];
    const state = stateWith({ players: [player({ role: "contingency_planner" })] });
    expect(
      deriveActionButtons(state, legal).find((b) => b.actionKind === "contingency_take"),
    ).toBeDefined();
  });

  it("inserts Play Event when the player holds an event card", () => {
    const eventCard: EventCard = { kind: "event", event: "one_quiet_night" };
    const hand: PlayerCard[] = [eventCard];
    const state = stateWith({ players: [player({ hand })] });
    const buttons = deriveActionButtons(state, []);
    expect(buttons.find((b) => b.actionKind === "play_event")).toBeDefined();
  });

  it("also inserts Play Event when the player has a contingency-stored event", () => {
    const eventCard: EventCard = { kind: "event", event: "airlift" };
    const state = stateWith({ contingencyCard: eventCard });
    expect(deriveActionButtons(state, []).find((b) => b.actionKind === "play_event")).toBeDefined();
  });

  it("Play Event lands immediately before Pass", () => {
    const eventCard: EventCard = { kind: "event", event: "one_quiet_night" };
    const state = stateWith({ players: [player({ hand: [eventCard] })] });
    const labels = deriveActionButtons(state, []).map((b) => b.actionKind);
    const playEventIdx = labels.indexOf("play_event");
    expect(labels[playEventIdx + 1]).toBe("pass");
  });
});
