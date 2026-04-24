import { ALL_CITY_IDS, areCitiesConnected, getCityNeighbors } from "./city-graph";
import type {
  CityCard,
  DiseaseColor,
  EventType,
  GameState,
  LegalAction,
  PlayerCard,
  PlayerState,
} from "./types";
import { DISEASE_COLORS, MAX_RESEARCH_STATIONS } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

function cityCardsOfColor(hand: readonly PlayerCard[], color: DiseaseColor): number[] {
  const indices: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.kind === "city" && c.color === color) indices.push(i);
  }
  return indices;
}

function hasMatchingCityCard(hand: readonly PlayerCard[], cityId: string): number {
  return hand.findIndex((c) => c.kind === "city" && c.cityId === cityId);
}

function hasCityCard(hand: readonly PlayerCard[], idx: number): boolean {
  return idx >= 0 && idx < hand.length && hand[idx].kind === "city";
}

function playersInSameCity(state: GameState, pId: number): PlayerState[] {
  const loc = state.players[pId].location;
  return state.players.filter((p) => p.id !== pId && p.location === loc);
}

// ---------------------------------------------------------------------------
// Per-action legality predicates
// ---------------------------------------------------------------------------
//
// These are the single source of truth for "can player X do action Y right
// now?" — consumed by both getLegalActions (for enumeration) and
// validateAction (for dispatch-time checks).

export function canDriveFerry(state: GameState, pId: number, to: string): boolean {
  return areCitiesConnected(state.players[pId].location, to);
}

export function canDirectFlight(state: GameState, pId: number, cardIdx: number): boolean {
  const player = state.players[pId];
  if (!hasCityCard(player.hand, cardIdx)) return false;
  const card = player.hand[cardIdx] as CityCard;
  return card.cityId !== player.location;
}

export function canCharterFlight(state: GameState, pId: number): boolean {
  const player = state.players[pId];
  return hasMatchingCityCard(player.hand, player.location) >= 0;
}

export function canShuttleFlight(state: GameState, pId: number, to: string): boolean {
  const player = state.players[pId];
  return (
    state.researchStations.includes(player.location) &&
    state.researchStations.includes(to) &&
    player.location !== to
  );
}

export function canBuildStation(state: GameState, pId: number): boolean {
  const player = state.players[pId];
  if (state.researchStations.includes(player.location)) return false;
  if (player.role === "operations_expert") return true;
  return hasMatchingCityCard(player.hand, player.location) >= 0;
}

export function canTreatDisease(state: GameState, pId: number, color: DiseaseColor): boolean {
  const player = state.players[pId];
  return state.cityCubes[player.location][color] > 0;
}

export function canShareKnowledge(
  state: GameState,
  giverId: number,
  receiverId: number,
  cardIdx: number,
): boolean {
  const giver = state.players[giverId];
  const receiver = state.players[receiverId];
  if (giver.location !== receiver.location) return false;
  if (!hasCityCard(giver.hand, cardIdx)) return false;

  const card = giver.hand[cardIdx] as CityCard;

  if (giver.role === "researcher") return true;

  return card.cityId === giver.location;
}

export function canDiscoverCure(state: GameState, pId: number, color: DiseaseColor): boolean {
  const player = state.players[pId];
  if (!state.researchStations.includes(player.location)) return false;
  if (state.diseaseStatus[color] !== "active") return false;

  const needed = player.role === "scientist" ? 4 : 5;
  const matching = cityCardsOfColor(player.hand, color);
  return matching.length >= needed;
}

export function canOpsExpertMove(state: GameState, pId: number, cardIdx: number): boolean {
  const player = state.players[pId];
  if (player.role !== "operations_expert") return false;
  if (player.usedOpsExpertMove) return false;
  if (!state.researchStations.includes(player.location)) return false;
  return hasCityCard(player.hand, cardIdx);
}

export function canDispatcherMoveToPawn(
  state: GameState,
  dispatcherId: number,
  targetId: number,
  toPlayerId: number,
): boolean {
  const dispatcher = state.players[dispatcherId];
  if (dispatcher.role !== "dispatcher") return false;
  if (targetId === toPlayerId) return false;
  const target = state.players[targetId];
  const toPawn = state.players[toPlayerId];
  return target.location !== toPawn.location;
}

export function canContingencyTake(state: GameState, pId: number, discardIdx: number): boolean {
  const player = state.players[pId];
  if (player.role !== "contingency_planner") return false;
  if (state.contingencyCard !== null) return false;
  if (discardIdx < 0 || discardIdx >= state.playerDiscard.length) return false;
  return state.playerDiscard[discardIdx].kind === "event";
}

/**
 * Whether an event card can be played at this moment. Events interrupt almost
 * any phase — the exceptions are:
 *   - the game is over (result set or phase === "game_over")
 *   - setup phase (game hasn't started)
 *   - forecast phase (a Forecast event is already mid-resolution; stacking
 *     another event on top would be meaningless)
 */
export function canPlayEvent(state: GameState): boolean {
  if (state.result !== null) return false;
  return state.phase !== "game_over" && state.phase !== "forecast" && state.phase !== "setup";
}

// ---------------------------------------------------------------------------
// Event enumeration (shared between actions phase and automated phases)
// ---------------------------------------------------------------------------

function addEventActions(state: GameState, out: LegalAction[]): void {
  if (!canPlayEvent(state)) return;

  const p = currentPlayer(state);

  // Events in the current player's hand. We de-dupe by event type because
  // the UI only needs one entry per playable event — the caller picks
  // params when confirming, and the engine finds the actual card to discard.
  const seen = new Set<EventType>();
  for (const card of p.hand) {
    if (card.kind === "event" && !seen.has(card.event)) {
      out.push({ kind: "play_event", event: card.event, source: "hand" });
      seen.add(card.event);
    }
  }

  // Contingency-held event (only the Contingency Planner can play it,
  // and it doesn't return to the discard pile afterwards).
  if (
    p.role === "contingency_planner" &&
    state.contingencyCard !== null &&
    !seen.has(state.contingencyCard.event)
  ) {
    out.push({
      kind: "play_event",
      event: state.contingencyCard.event,
      source: "contingency",
    });
  }
}

// ---------------------------------------------------------------------------
// Aggregate: all legal actions at this moment
// ---------------------------------------------------------------------------

/**
 * Returns every action that is legal right now, as a `LegalAction[]`.
 *
 * Legal actions come in two flavors:
 *   - **Concrete**: shape-identical to a `GameAction` variant, safe to
 *     dispatch as-is.
 *   - **Open**: carries metadata (destinations, available card indices, etc.)
 *     but leaves one or more parameters unset. The UI/AI must resolve these
 *     into a concrete `GameAction` before dispatch. See the `LegalAction`
 *     definition in `types.ts` for details.
 *
 * The enumerator is phase-aware:
 *   - `forecast`: only `forecast_reorder`
 *   - `discard`: discard options for the over-limit player, plus events
 *   - `setup` / `game_over`: nothing
 *   - `draw` / `epidemic` / `infect`: only event plays can interrupt
 *   - `actions`: the full suite
 */
export function getLegalActions(state: GameState): LegalAction[] {
  if (state.result !== null) return [];
  if (state.phase === "setup" || state.phase === "game_over") return [];

  const actions: LegalAction[] = [];

  // Forecast phase: the only legal action is to submit a reorder.
  if (state.phase === "forecast") {
    actions.push({ kind: "forecast_reorder" });
    return actions;
  }

  // Discard phase: the over-limit player must choose cards to discard.
  // Events are still playable (e.g. Resilient Population before infecting).
  if (state.phase === "discard") {
    const discardingIdx = state.discardingPlayerIndex ?? state.currentPlayerIndex;
    const hand = state.players[discardingIdx].hand;
    for (let i = 0; i < hand.length; i++) {
      actions.push({ kind: "discard_card", cardIdx: i });
    }
    addEventActions(state, actions);
    return actions;
  }

  // Automated phases (draw / epidemic / infect): the only way for a human to
  // interject is by playing an event card. Those are handled at the parent
  // state level in the XState machine via an internal transition — see
  // `machine.ts`.
  if (state.phase !== "actions") {
    addEventActions(state, actions);
    return actions;
  }

  // --- Actions phase ------------------------------------------------------
  if (state.actionsRemaining <= 0) {
    // Pathological state — phase should auto-transition to draw. Still expose
    // events in case the engine hasn't ticked forward yet.
    addEventActions(state, actions);
    return actions;
  }

  const p = currentPlayer(state);
  const pId = p.id;

  // Drive / Ferry
  for (const neighbor of getCityNeighbors(p.location)) {
    actions.push({ kind: "drive_ferry", to: neighbor });
  }

  // Direct Flight — one entry per discardable city card.
  for (let i = 0; i < p.hand.length; i++) {
    if (canDirectFlight(state, pId, i)) {
      actions.push({ kind: "direct_flight", cardIdx: i });
    }
  }

  // Charter Flight — open action; caller picks a destination.
  if (canCharterFlight(state, pId)) {
    const destinations = ALL_CITY_IDS.filter((c) => c !== p.location);
    actions.push({ kind: "charter_flight", destinations });
  }

  // Shuttle Flight — every research-station destination, if we're on one.
  if (state.researchStations.includes(p.location)) {
    for (const station of state.researchStations) {
      if (canShuttleFlight(state, pId, station)) {
        actions.push({ kind: "shuttle_flight", to: station });
      }
    }
  }

  // Build Research Station
  if (canBuildStation(state, pId)) {
    if (state.researchStations.length >= MAX_RESEARCH_STATIONS) {
      // Cap reached — caller must pick an existing station to relocate.
      // `canBuildStation` already guaranteed we're not standing on one.
      for (const existing of state.researchStations) {
        actions.push({ kind: "build_station", relocateFrom: existing });
      }
    } else {
      actions.push({ kind: "build_station" });
    }
  }

  // Treat Disease
  for (const color of DISEASE_COLORS) {
    if (canTreatDisease(state, pId, color)) {
      actions.push({ kind: "treat_disease", color });
    }
  }

  // Share Knowledge — enumerate both directions with each colocated player.
  const colocated = playersInSameCity(state, pId);
  for (const other of colocated) {
    for (let i = 0; i < p.hand.length; i++) {
      if (canShareKnowledge(state, pId, other.id, i)) {
        actions.push({ kind: "share_give", targetId: other.id, cardIdx: i });
      }
    }
    for (let i = 0; i < other.hand.length; i++) {
      if (canShareKnowledge(state, other.id, pId, i)) {
        actions.push({ kind: "share_take", fromId: other.id, cardIdx: i });
      }
    }
  }

  // Discover a Cure — open action; caller picks exactly `needed` cards from
  // the available set. This replaces the old `.slice(0, needed)` shortcut,
  // which silently burned whichever cards happened to be first in hand.
  for (const color of DISEASE_COLORS) {
    if (canDiscoverCure(state, pId, color)) {
      const needed = p.role === "scientist" ? 4 : 5;
      const availableCardIndices = cityCardsOfColor(p.hand, color);
      actions.push({
        kind: "discover_cure",
        color,
        availableCardIndices,
        needed,
      });
    }
  }

  // Operations Expert special move — open action; caller picks a destination.
  if (
    p.role === "operations_expert" &&
    !p.usedOpsExpertMove &&
    state.researchStations.includes(p.location)
  ) {
    const destinations = ALL_CITY_IDS.filter((c) => c !== p.location);
    for (let i = 0; i < p.hand.length; i++) {
      if (p.hand[i].kind === "city") {
        actions.push({ kind: "ops_move", cardIdx: i, destinations });
      }
    }
  }

  // Dispatcher specials
  if (p.role === "dispatcher") {
    for (const target of state.players) {
      if (target.id === pId) continue; // Own pawn moves via normal actions

      // Move target pawn to another pawn's city
      for (const other of state.players) {
        if (other.id === target.id) continue;
        if (canDispatcherMoveToPawn(state, pId, target.id, other.id)) {
          actions.push({
            kind: "dispatcher_move_to_pawn",
            targetId: target.id,
            toPlayerId: other.id,
          });
        }
      }

      // Move target pawn "as if" it were our own. Each underlying movement
      // action is enumerated concretely so the caller never has to infer
      // which moves are valid for the target pawn.
      //
      // drive/ferry: every neighbor of the target's current city
      for (const neighbor of getCityNeighbors(target.location)) {
        actions.push({
          kind: "dispatcher_move_as",
          targetId: target.id,
          moveAction: { kind: "drive_ferry", to: neighbor },
        });
      }

      // direct flight: any city card in the dispatcher's own hand, provided
      // the target isn't already there
      for (let i = 0; i < p.hand.length; i++) {
        const card = p.hand[i];
        if (card.kind !== "city") continue;
        if (card.cityId === target.location) continue;
        actions.push({
          kind: "dispatcher_move_as",
          targetId: target.id,
          moveAction: { kind: "direct_flight", cardIdx: i },
        });
      }

      // charter flight: dispatcher must hold the target's current-city card;
      // then the target can be flown anywhere
      const hasTargetLocCard = p.hand.some(
        (c) => c.kind === "city" && c.cityId === target.location,
      );
      if (hasTargetLocCard) {
        for (const destId of ALL_CITY_IDS) {
          if (destId === target.location) continue;
          actions.push({
            kind: "dispatcher_move_as",
            targetId: target.id,
            moveAction: { kind: "charter_flight", to: destId },
          });
        }
      }

      // shuttle flight: target at a research station can hop to any other
      if (state.researchStations.includes(target.location)) {
        for (const station of state.researchStations) {
          if (station === target.location) continue;
          actions.push({
            kind: "dispatcher_move_as",
            targetId: target.id,
            moveAction: { kind: "shuttle_flight", to: station },
          });
        }
      }
    }
  }

  // Contingency Planner — grab an event from the discard pile
  if (p.role === "contingency_planner" && state.contingencyCard === null) {
    for (let i = 0; i < state.playerDiscard.length; i++) {
      if (state.playerDiscard[i].kind === "event") {
        actions.push({ kind: "contingency_take", discardIdx: i });
      }
    }
  }

  // Pass — always available in actions phase
  actions.push({ kind: "pass" });

  // Events are also playable during actions phase
  addEventActions(state, actions);

  return actions;
}
