import { CITY_DATA } from "./city-graph";
import { shuffle, sortHand } from "./deck";
import { applyEvent, applyForecastReorder } from "./events";
import { applyMedicAutoRemove, checkEradication, infectCity } from "./infection";
import type { Rng } from "./rng";
import { cloneGameState } from "./state-utils";
import type { CityCard, DiseaseColor, EventCard, GameAction, GameState, PlayerCard } from "./types";
import {
  ACTIONS_PER_TURN,
  DISEASE_COLORS,
  HAND_LIMIT,
  INFECTION_RATE_TRACK,
  MAX_RESEARCH_STATIONS,
} from "./types";
import { validateAction } from "./validation";

// ---------------------------------------------------------------------------
// Win / loss checks
// ---------------------------------------------------------------------------

function checkWin(state: GameState): GameState {
  const allCured = DISEASE_COLORS.every((c) => state.diseaseStatus[c] !== "active");
  if (allCured) {
    const s = cloneGameState(state);
    s.result = "win";
    s.phase = "game_over";
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: "Victory! All four diseases have been cured!",
    });
    return s;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Move player and handle medic auto-remove
// ---------------------------------------------------------------------------

function movePlayer(state: GameState, playerId: number, to: string): GameState {
  const s = cloneGameState(state);
  s.players[playerId].location = to;
  const cityName = CITY_DATA.get(to)?.name ?? to;
  s.log.push({
    turn: s.turnNumber,
    player: s.currentPlayerIndex,
    message: `Player ${playerId} moved to ${cityName}`,
  });
  return applyMedicAutoRemove(s);
}

// ---------------------------------------------------------------------------
// Apply a single game action during the "actions" phase
// ---------------------------------------------------------------------------

/**
 * Thrown by `applyAction` when the validator rejects an action. The UI is
 * expected to only dispatch actions derived from `getLegalActions`, so hitting
 * this path indicates a bug (stale UI state, race, or missing guard). We
 * throw rather than silently returning state so the failure is loud and
 * traceable — the state machine can catch it at the action boundary.
 */
export class InvalidActionError extends Error {
  readonly action: GameAction;
  readonly reason: string;
  constructor(action: GameAction, reason: string) {
    super(`[pandemic] rejected ${action.kind}: ${reason}`);
    this.name = "InvalidActionError";
    this.action = action;
    this.reason = reason;
  }
}

export function applyAction(state: GameState, action: GameAction): GameState {
  // All actions go through the validator first. On failure we throw — the
  // engine never silently half-applies an action, never mutates on an
  // illegal input, and never trusts the caller.
  const v = validateAction(state, action);
  if (!v.ok) {
    throw new InvalidActionError(action, v.reason);
  }

  // Event cards don't consume an action and can be played in many phases
  if (action.kind === "play_event") {
    return applyEvent(state, state.currentPlayerIndex, action.event, action.params);
  }

  // Forecast reorder
  if (action.kind === "forecast_reorder") {
    return applyForecastReorder(state, action.newOrder);
  }

  // Discard phase
  if (action.kind === "discard_card") {
    return applyDiscard(state, action.cardIdx);
  }

  let s: GameState;
  const pId = state.currentPlayerIndex;

  switch (action.kind) {
    case "drive_ferry":
      s = movePlayer(state, pId, action.to);
      s.actionLog.push({
        turn: s.turnNumber,
        playerIndex: pId,
        action: "drive",
        city: CITY_DATA.get(action.to)?.name ?? action.to,
      });
      break;

    case "direct_flight": {
      const card = state.players[pId].hand[action.cardIdx] as CityCard;
      s = cloneGameState(state);
      s.players[pId].hand.splice(action.cardIdx, 1);
      s.playerDiscard.push(card);
      s = movePlayer(s, pId, card.cityId);
      s.actionLog.push({
        turn: s.turnNumber,
        playerIndex: pId,
        action: "direct-flight",
        city: CITY_DATA.get(card.cityId)?.name ?? card.cityId,
      });
      break;
    }

    case "charter_flight": {
      s = cloneGameState(state);
      const matchIdx = s.players[pId].hand.findIndex(
        (c) => c.kind === "city" && c.cityId === s.players[pId].location,
      );
      if (matchIdx >= 0) {
        const [card] = s.players[pId].hand.splice(matchIdx, 1);
        s.playerDiscard.push(card);
      }
      s = movePlayer(s, pId, action.to);
      s.actionLog.push({
        turn: s.turnNumber,
        playerIndex: pId,
        action: "charter-flight",
        city: CITY_DATA.get(action.to)?.name ?? action.to,
      });
      break;
    }

    case "shuttle_flight":
      s = movePlayer(state, pId, action.to);
      s.actionLog.push({
        turn: s.turnNumber,
        playerIndex: pId,
        action: "shuttle-flight",
        city: CITY_DATA.get(action.to)?.name ?? action.to,
      });
      break;

    case "build_station":
      s = applyBuildStation(state, pId, action.relocateFrom);
      break;

    case "treat_disease":
      s = applyTreatDisease(state, pId, action.color);
      break;

    case "share_give":
      s = applyShareGive(state, pId, action.targetId, action.cardIdx);
      break;

    case "share_take":
      s = applyShareTake(state, pId, action.fromId, action.cardIdx);
      break;

    case "discover_cure":
      s = applyDiscoverCure(state, pId, action.color, action.cardIndices);
      break;

    case "ops_move": {
      s = cloneGameState(state);
      s.players[pId].hand.splice(action.cardIdx, 1);
      s.players[pId].usedOpsExpertMove = true;
      s = movePlayer(s, pId, action.to);
      s.actionLog.push({
        turn: s.turnNumber,
        playerIndex: pId,
        action: "drive",
        city: CITY_DATA.get(action.to)?.name ?? action.to,
        detail: "Operations Expert special move",
      });
      break;
    }

    case "dispatcher_move_to_pawn": {
      const toPawn = state.players[action.toPlayerId];
      s = movePlayer(state, action.targetId, toPawn.location);
      s.actionLog.push({
        turn: s.turnNumber,
        playerIndex: pId,
        action: "drive",
        city: CITY_DATA.get(toPawn.location)?.name ?? toPawn.location,
        detail: `Dispatcher moved player ${action.targetId}`,
      });
      break;
    }

    case "dispatcher_move_as": {
      const ma = action.moveAction;
      const targetLoc = state.players[action.targetId].location;
      s = cloneGameState(state);

      let destCity: string;
      if (ma.kind === "drive_ferry") {
        s = movePlayer(s, action.targetId, ma.to);
        destCity = ma.to;
      } else if (ma.kind === "direct_flight") {
        // Dispatcher uses own hand for direct/charter
        const card = s.players[pId].hand[ma.cardIdx] as CityCard;
        s.players[pId].hand.splice(ma.cardIdx, 1);
        s.playerDiscard.push(card);
        s = movePlayer(s, action.targetId, card.cityId);
        destCity = card.cityId;
      } else if (ma.kind === "charter_flight") {
        // Card must match the target pawn's city
        const matchIdx = s.players[pId].hand.findIndex(
          (c) => c.kind === "city" && c.cityId === targetLoc,
        );
        if (matchIdx >= 0) {
          const [card] = s.players[pId].hand.splice(matchIdx, 1);
          s.playerDiscard.push(card);
        }
        s = movePlayer(s, action.targetId, ma.to);
        destCity = ma.to;
      } else if (ma.kind === "shuttle_flight") {
        s = movePlayer(s, action.targetId, ma.to);
        destCity = ma.to;
      } else {
        destCity = targetLoc;
      }
      s.actionLog.push({
        turn: s.turnNumber,
        playerIndex: pId,
        action:
          ma.kind === "drive_ferry"
            ? "drive"
            : ma.kind === "direct_flight"
              ? "direct-flight"
              : ma.kind === "charter_flight"
                ? "charter-flight"
                : "shuttle-flight",
        city: CITY_DATA.get(destCity)?.name ?? destCity,
        detail: `Dispatcher moved player ${action.targetId}`,
      });
      break;
    }

    case "contingency_take": {
      s = cloneGameState(state);
      const [eventCard] = s.playerDiscard.splice(action.discardIdx, 1);
      s.contingencyCard = eventCard as EventCard;
      s.log.push({
        turn: s.turnNumber,
        player: pId,
        message: `Contingency Planner stored event card`,
      });
      break;
    }

    case "pass":
      s = cloneGameState(state);
      s.actionsRemaining = 0;
      s.log.push({
        turn: s.turnNumber,
        player: pId,
        message: `Player ${pId} passed remaining actions`,
      });
      break;

    default: {
      // Exhaustiveness — play_event/forecast_reorder/discard_card are
      // handled above; everything else is covered by the cases. The
      // validator rejects unknown kinds, so reaching here is impossible.
      const _never: never = action;
      throw new Error(`Unhandled action kind: ${JSON.stringify(_never)}`);
    }
  }

  // Decrement actions (pass already set to 0)
  if (action.kind !== "pass") {
    s.actionsRemaining--;
  }

  // Check win after cure discovery
  if (action.kind === "discover_cure") {
    s = checkWin(s);
    if (s.result) return s;
  }

  // Check hand limit after share knowledge — receiver or taker may exceed 7
  if (action.kind === "share_give") {
    const receiver = s.players[action.targetId];
    if (receiver.hand.length > HAND_LIMIT) {
      s.discardingPlayerIndex = action.targetId;
      s.preDiscardPhase = s.actionsRemaining <= 0 ? "draw" : "actions";
      s.phase = "discard";
      return s;
    }
  }

  if (action.kind === "share_take") {
    const taker = s.players[pId];
    if (taker.hand.length > HAND_LIMIT) {
      s.discardingPlayerIndex = pId;
      s.preDiscardPhase = s.actionsRemaining <= 0 ? "draw" : "actions";
      s.phase = "discard";
      return s;
    }
  }

  // Transition to draw phase when actions exhausted
  if (s.actionsRemaining <= 0) {
    s.phase = "draw";
  }

  return s;
}

// ---------------------------------------------------------------------------
// Sub-action implementations
// ---------------------------------------------------------------------------

function applyBuildStation(state: GameState, pId: number, relocateFrom?: string): GameState {
  const s = cloneGameState(state);
  const player = s.players[pId];

  if (player.role !== "operations_expert") {
    const matchIdx = player.hand.findIndex(
      (c) => c.kind === "city" && c.cityId === player.location,
    );
    if (matchIdx >= 0) {
      const [card] = player.hand.splice(matchIdx, 1);
      s.playerDiscard.push(card);
    }
  }

  if (relocateFrom && s.researchStations.length >= MAX_RESEARCH_STATIONS) {
    s.researchStations = s.researchStations.filter((r) => r !== relocateFrom);
  }

  s.researchStations.push(player.location);
  const cityName = CITY_DATA.get(player.location)?.name ?? player.location;
  s.log.push({
    turn: s.turnNumber,
    player: pId,
    message: `Built research station in ${cityName}`,
  });
  s.actionLog.push({
    turn: s.turnNumber,
    playerIndex: pId,
    action: "build-station",
    city: cityName,
  });

  return s;
}

function applyTreatDisease(state: GameState, pId: number, color: DiseaseColor): GameState {
  const s = cloneGameState(state);
  const player = s.players[pId];
  const loc = player.location;
  const cubes = s.cityCubes[loc][color];
  // Validator already guarantees cubes > 0 at this city.

  const isMedic = player.role === "medic";
  const isCured = s.diseaseStatus[color] !== "active";
  const removeAll = isMedic || isCured;

  const removed = removeAll ? cubes : 1;
  s.cityCubes[loc][color] -= removed;
  s.diseaseCubeSupply[color] += removed;

  const cityName = CITY_DATA.get(loc)?.name ?? loc;
  s.log.push({
    turn: s.turnNumber,
    player: pId,
    message: `Treated ${color} disease in ${cityName} (removed ${removed} cube${removed > 1 ? "s" : ""})`,
  });
  s.actionLog.push({
    turn: s.turnNumber,
    playerIndex: pId,
    action: "treat",
    city: cityName,
    disease: color,
    detail: `removed ${removed} cube${removed > 1 ? "s" : ""}`,
  });

  return checkEradication(s, color);
}

function applyShareGive(
  state: GameState,
  giverId: number,
  receiverId: number,
  cardIdx: number,
): GameState {
  const s = cloneGameState(state);
  const [card] = s.players[giverId].hand.splice(cardIdx, 1);
  s.players[receiverId].hand.push(card);
  s.players[receiverId].hand = sortHand(s.players[receiverId].hand);

  s.log.push({
    turn: s.turnNumber,
    player: giverId,
    message: `Shared knowledge: gave card to player ${receiverId}`,
  });
  const giveCardName =
    card.kind === "city" ? (CITY_DATA.get(card.cityId)?.name ?? card.cityId) : "";
  s.actionLog.push({
    turn: s.turnNumber,
    playerIndex: giverId,
    action: "share",
    detail: `gave ${giveCardName} to player ${receiverId}`,
  });

  return s;
}

function applyShareTake(
  state: GameState,
  takerId: number,
  fromId: number,
  cardIdx: number,
): GameState {
  const s = cloneGameState(state);
  const [card] = s.players[fromId].hand.splice(cardIdx, 1);
  s.players[takerId].hand.push(card);
  s.players[takerId].hand = sortHand(s.players[takerId].hand);

  s.log.push({
    turn: s.turnNumber,
    player: takerId,
    message: `Shared knowledge: took card from player ${fromId}`,
  });
  const takeCardName =
    card.kind === "city" ? (CITY_DATA.get(card.cityId)?.name ?? card.cityId) : "";
  s.actionLog.push({
    turn: s.turnNumber,
    playerIndex: takerId,
    action: "share",
    detail: `took ${takeCardName} from player ${fromId}`,
  });

  return s;
}

function applyDiscoverCure(
  state: GameState,
  pId: number,
  color: DiseaseColor,
  cardIndices: number[],
): GameState {
  const s = cloneGameState(state);
  const player = s.players[pId];

  // Remove cards in reverse index order to avoid shifting
  const sorted = [...cardIndices].sort((a, b) => b - a);
  for (const idx of sorted) {
    const [card] = player.hand.splice(idx, 1);
    s.playerDiscard.push(card);
  }

  s.diseaseStatus[color] = "cured";
  s.log.push({
    turn: s.turnNumber,
    player: pId,
    message: `Discovered cure for ${color} disease!`,
  });
  s.actionLog.push({
    turn: s.turnNumber,
    playerIndex: pId,
    action: "cure",
    disease: color,
  });

  return checkEradication(s, color);
}

// ---------------------------------------------------------------------------
// Discard
// ---------------------------------------------------------------------------

function applyDiscard(state: GameState, cardIdx: number): GameState {
  const s = cloneGameState(state);
  const playerIdx = s.discardingPlayerIndex ?? s.currentPlayerIndex;
  const player = s.players[playerIdx];
  // Validator already bounds-checks cardIdx.
  const [card] = player.hand.splice(cardIdx, 1);
  s.playerDiscard.push(card);

  const discardDetail =
    card.kind === "city"
      ? (CITY_DATA.get(card.cityId)?.name ?? card.cityId)
      : card.kind === "event"
        ? card.event
        : "a card";
  s.actionLog.push({
    turn: s.turnNumber,
    playerIndex: playerIdx,
    action: "discard",
    detail: discardDetail,
  });

  if (player.hand.length <= HAND_LIMIT) {
    s.phase = s.preDiscardPhase ?? "infect";
    s.discardingPlayerIndex = null;
    s.preDiscardPhase = null;
  }

  return s;
}

// ---------------------------------------------------------------------------
// Draw phase
// ---------------------------------------------------------------------------

export function applyDrawPhase(state: GameState): GameState {
  if (state.result) return state;

  const s = cloneGameState(state);

  if (s.playerDeck.length < 2) {
    s.result = "loss_cards";
    s.phase = "game_over";
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: "Game Over: Not enough player cards to draw",
    });
    return s;
  }

  const drawn: PlayerCard[] = [];
  // biome-ignore lint/style/noNonNullAssertion: length >= 2 verified above
  drawn.push(s.playerDeck.shift()!);
  // biome-ignore lint/style/noNonNullAssertion: length >= 2 verified above
  drawn.push(s.playerDeck.shift()!);

  let epidemicCount = 0;
  const player = s.players[s.currentPlayerIndex];

  for (const card of drawn) {
    if (card.kind === "epidemic") {
      epidemicCount++;
    } else {
      player.hand.push(card);
    }
  }

  player.hand = sortHand(player.hand);

  s.log.push({
    turn: s.turnNumber,
    player: s.currentPlayerIndex,
    message: `Drew ${drawn.length} cards${epidemicCount > 0 ? ` (${epidemicCount} epidemic${epidemicCount > 1 ? "s" : ""})` : ""}`,
  });

  for (const card of drawn) {
    if (card.kind === "epidemic") {
      // Epidemic cards are logged separately in resolveEpidemic
      continue;
    }
    const drawDetail =
      card.kind === "city"
        ? (CITY_DATA.get(card.cityId)?.name ?? card.cityId)
        : card.kind === "event"
          ? card.event
          : undefined;
    s.actionLog.push({
      turn: s.turnNumber,
      playerIndex: s.currentPlayerIndex,
      action: "draw-card",
      detail: drawDetail,
    });
  }

  if (epidemicCount > 0) {
    s.pendingEpidemics = epidemicCount;
    s.phase = "epidemic";
  } else if (player.hand.length > HAND_LIMIT) {
    s.phase = "discard";
    s.discardingPlayerIndex = s.currentPlayerIndex;
    s.preDiscardPhase = "infect";
  } else {
    s.phase = "infect";
  }

  return s;
}

// ---------------------------------------------------------------------------
// Epidemic resolution
// ---------------------------------------------------------------------------

export function resolveEpidemic(state: GameState, rng: Rng): GameState {
  if (state.result) return state;

  let s = cloneGameState(state);

  // 1. Increase infection rate
  if (s.infectionRateIndex < INFECTION_RATE_TRACK.length - 1) {
    s.infectionRateIndex++;
  }

  s.log.push({
    turn: s.turnNumber,
    player: s.currentPlayerIndex,
    message: `Epidemic! Infection rate now ${INFECTION_RATE_TRACK[s.infectionRateIndex]}`,
  });

  // 2. Infect: draw bottom card from infection deck
  if (s.infectionDeck.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: length > 0 verified on the line above
    const bottomCard = s.infectionDeck.pop()!;
    const cityName = CITY_DATA.get(bottomCard.cityId)?.name ?? bottomCard.cityId;
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: `Epidemic infection: ${cityName} (${bottomCard.color})`,
    });

    s.actionLog.push({
      turn: s.turnNumber,
      playerIndex: s.currentPlayerIndex,
      action: "epidemic",
      city: cityName,
      disease: bottomCard.color,
    });

    s = infectCity(s, bottomCard.cityId, bottomCard.color, 3);
    s.infectionDiscard.push(bottomCard);
  }

  if (s.result) return s;

  // 3. Intensify: shuffle infection discard, place on top
  const reshuffled = shuffle(s.infectionDiscard, rng);
  s.infectionDeck = [...reshuffled, ...s.infectionDeck];
  s.infectionDiscard = [];

  // Decrement pending
  s.pendingEpidemics--;

  if (s.pendingEpidemics > 0) {
    // Stay in epidemic phase; events can be played between epidemics
    return s;
  }

  // Check hand limit
  const player = s.players[s.currentPlayerIndex];
  if (player.hand.length > HAND_LIMIT) {
    s.phase = "discard";
    s.discardingPlayerIndex = s.currentPlayerIndex;
    s.preDiscardPhase = "infect";
  } else {
    s.phase = "infect";
  }

  return s;
}

// ---------------------------------------------------------------------------
// Infection phase
// ---------------------------------------------------------------------------

export function applyInfectPhase(state: GameState): GameState {
  if (state.result) return state;

  let s = cloneGameState(state);

  if (s.skipNextInfect) {
    s.skipNextInfect = false;
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: "Infection step skipped (One Quiet Night)",
    });
    return advanceTurn(s);
  }

  const rate = INFECTION_RATE_TRACK[s.infectionRateIndex];

  for (let i = 0; i < rate; i++) {
    if (s.result) break;
    if (s.infectionDeck.length === 0) break;

    // biome-ignore lint/style/noNonNullAssertion: length > 0 verified on the line above
    const card = s.infectionDeck.shift()!;
    const cityName = CITY_DATA.get(card.cityId)?.name ?? card.cityId;
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: `Infection: ${cityName} (${card.color})`,
    });
    s.actionLog.push({
      turn: s.turnNumber,
      playerIndex: s.currentPlayerIndex,
      action: "infect",
      city: cityName,
      disease: card.color,
    });

    s = infectCity(s, card.cityId, card.color, 1);
    s.infectionDiscard.push(card);
  }

  if (s.result) return s;

  return advanceTurn(s);
}

// ---------------------------------------------------------------------------
// Turn advancement
// ---------------------------------------------------------------------------

export function advanceTurn(state: GameState): GameState {
  const s = cloneGameState(state);
  s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
  s.actionsRemaining = ACTIONS_PER_TURN;
  s.players[s.currentPlayerIndex].usedOpsExpertMove = false;
  s.phase = "actions";
  s.turnNumber++;

  const player = s.players[s.currentPlayerIndex];
  s.log.push({
    turn: s.turnNumber,
    player: s.currentPlayerIndex,
    message: `Turn ${s.turnNumber}: Player ${s.currentPlayerIndex} (${player.role})`,
  });

  return s;
}
