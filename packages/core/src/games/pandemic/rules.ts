import { areCitiesConnected, getCityNeighbors } from "./city-graph";
import type {
  CityCard,
  DiseaseColor,
  GameAction,
  GameState,
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

function cityCardsOfColor(hand: PlayerCard[], color: DiseaseColor): number[] {
  const indices: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.kind === "city" && c.color === color) indices.push(i);
  }
  return indices;
}

function hasMatchingCityCard(hand: PlayerCard[], cityId: string): number {
  return hand.findIndex((c) => c.kind === "city" && c.cityId === cityId);
}

function hasCityCard(hand: PlayerCard[], idx: number): boolean {
  return idx >= 0 && idx < hand.length && hand[idx].kind === "city";
}

function playersInSameCity(state: GameState, pId: number): PlayerState[] {
  const loc = state.players[pId].location;
  return state.players.filter((p) => p.id !== pId && p.location === loc);
}

// ---------------------------------------------------------------------------
// Movement validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Other action validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Aggregate: all legal actions for the current player
// ---------------------------------------------------------------------------

export function getLegalActions(state: GameState): GameAction[] {
  if (state.phase !== "actions") return [];
  if (state.actionsRemaining <= 0) return [];

  const actions: GameAction[] = [];
  const p = currentPlayer(state);
  const pId = p.id;

  // Drive / Ferry
  for (const neighbor of getCityNeighbors(p.location)) {
    actions.push({ kind: "drive_ferry", to: neighbor });
  }

  // Direct Flight
  for (let i = 0; i < p.hand.length; i++) {
    if (canDirectFlight(state, pId, i)) {
      actions.push({ kind: "direct_flight", cardIdx: i });
    }
  }

  // Charter Flight — can go to any city
  if (canCharterFlight(state, pId)) {
    // We represent this as available; the UI will prompt for a destination
    actions.push({ kind: "charter_flight", to: "__any__" });
  }

  // Shuttle Flight
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

  // Share Knowledge
  const colocated = playersInSameCity(state, pId);
  for (const other of colocated) {
    // Give
    for (let i = 0; i < p.hand.length; i++) {
      if (canShareKnowledge(state, pId, other.id, i)) {
        actions.push({ kind: "share_give", targetId: other.id, cardIdx: i });
      }
    }
    // Take
    for (let i = 0; i < other.hand.length; i++) {
      if (canShareKnowledge(state, other.id, pId, i)) {
        actions.push({ kind: "share_take", fromId: other.id, cardIdx: i });
      }
    }
  }

  // Discover a Cure
  for (const color of DISEASE_COLORS) {
    if (canDiscoverCure(state, pId, color)) {
      const needed = p.role === "scientist" ? 4 : 5;
      const indices = cityCardsOfColor(p.hand, color).slice(0, needed);
      actions.push({ kind: "discover_cure", color, cardIndices: indices });
    }
  }

  // Operations Expert special move
  if (
    p.role === "operations_expert" &&
    !p.usedOpsExpertMove &&
    state.researchStations.includes(p.location)
  ) {
    for (let i = 0; i < p.hand.length; i++) {
      if (p.hand[i].kind === "city") {
        actions.push({ kind: "ops_move", to: "__any__", cardIdx: i });
      }
    }
  }

  // Dispatcher actions
  if (p.role === "dispatcher") {
    for (const target of state.players) {
      if (target.id === pId) continue;
      // Move to another pawn
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
      // Move as if own pawn (drive/ferry for the target)
      for (const neighbor of getCityNeighbors(target.location)) {
        actions.push({
          kind: "dispatcher_move_as",
          targetId: target.id,
          moveAction: { kind: "drive_ferry", to: neighbor },
        });
      }
    }
  }

  // Contingency Planner
  if (p.role === "contingency_planner" && state.contingencyCard === null) {
    for (let i = 0; i < state.playerDiscard.length; i++) {
      if (state.playerDiscard[i].kind === "event") {
        actions.push({ kind: "contingency_take", discardIdx: i });
      }
    }
  }

  // Pass
  actions.push({ kind: "pass" });

  return actions;
}

/**
 * Check if an event card can be played right now.
 * Events can be played at almost any time except between drawing and resolving.
 */
export function canPlayEvent(state: GameState): boolean {
  return state.phase !== "game_over" && state.phase !== "forecast";
}
