import { CITY_DATA } from "./city-graph";
import {
  canBuildStation,
  canCharterFlight,
  canContingencyTake,
  canDirectFlight,
  canDiscoverCure,
  canDispatcherMoveToPawn,
  canDriveFerry,
  canOpsExpertMove,
  canPlayEvent,
  canShareKnowledge,
  canShuttleFlight,
  canTreatDisease,
} from "./rules";
import type { CityCard, GameAction, GameState, PlayerCard, PlayerState } from "./types";
import { HAND_LIMIT, MAX_RESEARCH_STATIONS } from "./types";

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const ok: ValidationResult = { ok: true };
const err = (reason: string): ValidationResult => ({ ok: false, reason });

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function cityExists(cityId: string): boolean {
  return CITY_DATA.has(cityId);
}

function indexInBounds<T>(arr: readonly T[], idx: number): boolean {
  return Number.isInteger(idx) && idx >= 0 && idx < arr.length;
}

function isCityCard(card: PlayerCard | undefined): card is CityCard {
  return card?.kind === "city";
}

function isUniqueIntArray(xs: readonly number[]): boolean {
  const seen = new Set<number>();
  for (const x of xs) {
    if (!Number.isInteger(x)) return false;
    if (seen.has(x)) return false;
    seen.add(x);
  }
  return true;
}

function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

// ---------------------------------------------------------------------------
// Phase gating
// ---------------------------------------------------------------------------

/**
 * Events and discards have their own phase rules; everything else belongs to
 * the actions phase. Returns an error result if the action is not legal in
 * the current phase; returns `ok` if the phase is acceptable (further per-
 * action validation still runs).
 */
function checkPhase(state: GameState, action: GameAction): ValidationResult {
  if (state.result !== null) return err("Game is over");

  switch (action.kind) {
    case "play_event":
      if (!canPlayEvent(state)) return err("Events cannot be played right now");
      return ok;

    case "forecast_reorder":
      if (state.phase !== "forecast") return err("Not in forecast phase");
      return ok;

    case "discard_card":
      if (state.phase !== "discard") return err("Not in discard phase");
      return ok;

    default:
      if (state.phase !== "actions") return err(`Cannot ${action.kind} outside the actions phase`);
      if (state.actionsRemaining <= 0) return err("No actions remaining");
      return ok;
  }
}

// ---------------------------------------------------------------------------
// Per-action validators
// ---------------------------------------------------------------------------

function validateDriveFerry(state: GameState, to: string): ValidationResult {
  if (!cityExists(to)) return err(`Unknown city: ${to}`);
  if (!canDriveFerry(state, state.currentPlayerIndex, to)) {
    return err(`${to} is not adjacent to current location`);
  }
  return ok;
}

function validateDirectFlight(state: GameState, cardIdx: number): ValidationResult {
  const p = currentPlayer(state);
  if (!indexInBounds(p.hand, cardIdx)) return err("Card index out of range");
  if (!isCityCard(p.hand[cardIdx])) return err("Selected card is not a city card");
  if (!canDirectFlight(state, p.id, cardIdx)) return err("Already at that city");
  return ok;
}

function validateCharterFlight(state: GameState, to: string): ValidationResult {
  if (!cityExists(to)) return err(`Unknown city: ${to}`);
  const p = currentPlayer(state);
  if (to === p.location) return err("Already at that city");
  if (!canCharterFlight(state, p.id)) {
    return err("Missing city card matching current location");
  }
  return ok;
}

function validateShuttleFlight(state: GameState, to: string): ValidationResult {
  if (!cityExists(to)) return err(`Unknown city: ${to}`);
  if (!canShuttleFlight(state, state.currentPlayerIndex, to)) {
    return err("Both endpoints must have a research station");
  }
  return ok;
}

function validateBuildStation(state: GameState, relocateFrom?: string): ValidationResult {
  const p = currentPlayer(state);
  if (!canBuildStation(state, p.id)) return err("Cannot build a station here");

  if (state.researchStations.length >= MAX_RESEARCH_STATIONS) {
    if (!relocateFrom) return err("Station cap reached — must relocate an existing station");
    if (!state.researchStations.includes(relocateFrom)) {
      return err(`No research station in ${relocateFrom}`);
    }
    if (relocateFrom === p.location) {
      return err("Cannot relocate the station we're about to build on");
    }
  }
  return ok;
}

function validateTreatDisease(state: GameState, color: string): ValidationResult {
  const p = currentPlayer(state);
  const cubes = state.cityCubes[p.location];
  if (!cubes) return err("Player is at an unknown city");
  if (!(color in cubes)) return err(`Unknown disease color: ${color}`);
  if (!canTreatDisease(state, p.id, color as keyof typeof cubes)) {
    return err("No cubes of that color at current location");
  }
  return ok;
}

function validateShareGive(state: GameState, targetId: number, cardIdx: number): ValidationResult {
  if (!indexInBounds(state.players, targetId)) return err("Invalid target player");
  if (targetId === state.currentPlayerIndex) return err("Cannot share with yourself");
  if (!canShareKnowledge(state, state.currentPlayerIndex, targetId, cardIdx)) {
    return err("Cannot share that card with that player");
  }
  return ok;
}

function validateShareTake(state: GameState, fromId: number, cardIdx: number): ValidationResult {
  if (!indexInBounds(state.players, fromId)) return err("Invalid source player");
  if (fromId === state.currentPlayerIndex) return err("Cannot take a card from yourself");
  if (!canShareKnowledge(state, fromId, state.currentPlayerIndex, cardIdx)) {
    return err("Cannot take that card from that player");
  }
  return ok;
}

function validateDiscoverCure(
  state: GameState,
  color: string,
  cardIndices: readonly number[],
): ValidationResult {
  const p = currentPlayer(state);

  if (!(color in state.diseaseStatus)) return err(`Unknown disease color: ${color}`);
  const typedColor = color as keyof typeof state.diseaseStatus;
  if (!canDiscoverCure(state, p.id, typedColor)) {
    return err("Cannot discover cure: need research station, active disease, and matching hand");
  }

  const needed = p.role === "scientist" ? 4 : 5;
  if (cardIndices.length !== needed) {
    return err(`Must use exactly ${needed} cards`);
  }
  if (!isUniqueIntArray(cardIndices)) {
    return err("Card indices must be unique integers");
  }
  for (const idx of cardIndices) {
    if (!indexInBounds(p.hand, idx)) return err(`Card index ${idx} out of range`);
    const card = p.hand[idx];
    if (!isCityCard(card)) return err("All cure cards must be city cards");
    if (card.color !== typedColor) return err("All cure cards must match the target color");
  }
  return ok;
}

function validateOpsMove(state: GameState, to: string, cardIdx: number): ValidationResult {
  if (!cityExists(to)) return err(`Unknown city: ${to}`);
  const p = currentPlayer(state);
  if (to === p.location) return err("Already at that city");
  if (!canOpsExpertMove(state, p.id, cardIdx)) {
    return err("Operations Expert cannot make this move right now");
  }
  return ok;
}

function validateDispatcherMoveToPawn(
  state: GameState,
  targetId: number,
  toPlayerId: number,
): ValidationResult {
  if (!indexInBounds(state.players, targetId)) return err("Invalid target player");
  if (!indexInBounds(state.players, toPlayerId)) return err("Invalid destination player");
  if (!canDispatcherMoveToPawn(state, state.currentPlayerIndex, targetId, toPlayerId)) {
    return err("Dispatcher cannot move that pawn there");
  }
  return ok;
}

function validateDispatcherMoveAs(
  state: GameState,
  action: Extract<GameAction, { kind: "dispatcher_move_as" }>,
): ValidationResult {
  if (currentPlayer(state).role !== "dispatcher") {
    return err("Only the Dispatcher can move other pawns");
  }
  if (!indexInBounds(state.players, action.targetId)) return err("Invalid target player");
  const target = state.players[action.targetId];
  const ma = action.moveAction;
  const dispatcher = currentPlayer(state);

  switch (ma.kind) {
    case "drive_ferry": {
      if (!cityExists(ma.to)) return err(`Unknown city: ${ma.to}`);
      // Check adjacency from target pawn's location
      const targetNeighbors = CITY_DATA.get(target.location)?.neighbors ?? [];
      if (!targetNeighbors.includes(ma.to)) {
        return err("Destination is not adjacent to target pawn's location");
      }
      return ok;
    }
    case "direct_flight": {
      if (!indexInBounds(dispatcher.hand, ma.cardIdx)) return err("Card index out of range");
      const card = dispatcher.hand[ma.cardIdx];
      if (!isCityCard(card)) return err("Selected card is not a city card");
      if (card.cityId === target.location) return err("Target pawn is already at that city");
      return ok;
    }
    case "charter_flight": {
      if (!cityExists(ma.to)) return err(`Unknown city: ${ma.to}`);
      if (ma.to === target.location) return err("Target pawn is already at that city");
      // Dispatcher must hold the card matching target pawn's location
      const hasCard = dispatcher.hand.some(
        (c) => c.kind === "city" && c.cityId === target.location,
      );
      if (!hasCard) return err("Dispatcher lacks the card for target pawn's city");
      return ok;
    }
    case "shuttle_flight": {
      if (!cityExists(ma.to)) return err(`Unknown city: ${ma.to}`);
      if (!state.researchStations.includes(target.location)) {
        return err("Target pawn is not at a research station");
      }
      if (!state.researchStations.includes(ma.to)) {
        return err("Destination has no research station");
      }
      if (ma.to === target.location) return err("Target pawn is already at that station");
      return ok;
    }
  }
}

function validateContingencyTake(state: GameState, discardIdx: number): ValidationResult {
  if (!canContingencyTake(state, state.currentPlayerIndex, discardIdx)) {
    return err("Contingency Planner cannot take that card");
  }
  return ok;
}

function validatePass(_state: GameState): ValidationResult {
  return ok;
}

function validateDiscardCard(state: GameState, cardIdx: number): ValidationResult {
  const playerIdx = state.discardingPlayerIndex ?? state.currentPlayerIndex;
  if (!indexInBounds(state.players, playerIdx)) return err("No player to discard");
  const hand = state.players[playerIdx].hand;
  if (!indexInBounds(hand, cardIdx)) return err("Card index out of range");
  if (hand.length <= HAND_LIMIT) return err("Not required to discard right now");
  return ok;
}

function validatePlayEvent(
  state: GameState,
  action: Extract<GameAction, { kind: "play_event" }>,
): ValidationResult {
  // The engine plays events as the current player — they must hold it in
  // hand, or it must be in the Contingency Planner's stored slot (and they
  // are the current player).
  const cp = currentPlayer(state);
  const inHand = cp.hand.some((c) => c.kind === "event" && c.event === action.event);
  const inContingency =
    cp.role === "contingency_planner" && state.contingencyCard?.event === action.event;
  if (!inHand && !inContingency) {
    return err("Current player does not hold that event card");
  }

  // Per-event parameter validation
  switch (action.event) {
    case "airlift": {
      const p = action.params as { targetPlayerId?: number; destination?: string };
      if (typeof p.targetPlayerId !== "number" || !indexInBounds(state.players, p.targetPlayerId)) {
        return err("Airlift: invalid target player");
      }
      if (typeof p.destination !== "string" || !cityExists(p.destination)) {
        return err("Airlift: invalid destination");
      }
      return ok;
    }
    case "one_quiet_night":
      return ok;
    case "government_grant": {
      const p = action.params as { cityId?: string; relocateFrom?: string };
      if (typeof p.cityId !== "string" || !cityExists(p.cityId)) {
        return err("Government Grant: invalid city");
      }
      if (state.researchStations.includes(p.cityId)) {
        return err("Government Grant: city already has a research station");
      }
      if (state.researchStations.length >= MAX_RESEARCH_STATIONS) {
        if (!p.relocateFrom) {
          return err("Government Grant: station cap reached — must relocate an existing station");
        }
        if (!state.researchStations.includes(p.relocateFrom)) {
          return err(`Government Grant: no research station in ${p.relocateFrom}`);
        }
      }
      return ok;
    }
    case "resilient_population": {
      const p = action.params as { infectionDiscardIdx?: number };
      if (
        typeof p.infectionDiscardIdx !== "number" ||
        !indexInBounds(state.infectionDiscard, p.infectionDiscardIdx)
      ) {
        return err("Resilient Population: invalid infection discard index");
      }
      return ok;
    }
    case "forecast": {
      // Forecast cannot be played while already in forecast phase (canPlayEvent
      // enforces this) but params are applied via forecast_reorder.
      return ok;
    }
  }
}

function validateForecastReorder(state: GameState, newOrder: readonly number[]): ValidationResult {
  const peek = Math.min(6, state.infectionDeck.length);
  if (newOrder.length !== peek) return err(`Forecast expects a permutation of ${peek} cards`);
  if (!isUniqueIntArray(newOrder)) return err("Forecast: indices must be unique integers");
  for (const idx of newOrder) {
    if (idx < 0 || idx >= peek) return err(`Forecast: index ${idx} out of range`);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Public: top-level validator
// ---------------------------------------------------------------------------

/**
 * Validate an action against the current game state. This is the single
 * source of truth for what's legal — both the engine (`applyAction`) and the
 * legal-action enumerator (`getLegalActions`) should agree with this.
 */
export function validateAction(state: GameState, action: GameAction): ValidationResult {
  const phaseCheck = checkPhase(state, action);
  if (!phaseCheck.ok) return phaseCheck;

  switch (action.kind) {
    case "drive_ferry":
      return validateDriveFerry(state, action.to);
    case "direct_flight":
      return validateDirectFlight(state, action.cardIdx);
    case "charter_flight":
      return validateCharterFlight(state, action.to);
    case "shuttle_flight":
      return validateShuttleFlight(state, action.to);
    case "build_station":
      return validateBuildStation(state, action.relocateFrom);
    case "treat_disease":
      return validateTreatDisease(state, action.color);
    case "share_give":
      return validateShareGive(state, action.targetId, action.cardIdx);
    case "share_take":
      return validateShareTake(state, action.fromId, action.cardIdx);
    case "discover_cure":
      return validateDiscoverCure(state, action.color, action.cardIndices);
    case "ops_move":
      return validateOpsMove(state, action.to, action.cardIdx);
    case "dispatcher_move_to_pawn":
      return validateDispatcherMoveToPawn(state, action.targetId, action.toPlayerId);
    case "dispatcher_move_as":
      return validateDispatcherMoveAs(state, action);
    case "contingency_take":
      return validateContingencyTake(state, action.discardIdx);
    case "pass":
      return validatePass(state);
    case "discard_card":
      return validateDiscardCard(state, action.cardIdx);
    case "play_event":
      return validatePlayEvent(state, action);
    case "forecast_reorder":
      return validateForecastReorder(state, action.newOrder);
  }
}
