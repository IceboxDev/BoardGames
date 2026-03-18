import { CITY_DATA } from "./city-graph";
import { shuffle, sortHand } from "./deck";
import { applyEvent, applyForecastReorder } from "./events";
import { applyMedicAutoRemove, checkEradication, infectCity } from "./infection";
import type { CityCard, DiseaseColor, EventCard, GameAction, GameState, PlayerCard } from "./types";
import {
  ACTIONS_PER_TURN,
  DISEASE_COLORS,
  HAND_LIMIT,
  INFECTION_RATE_TRACK,
  MAX_RESEARCH_STATIONS,
} from "./types";

// ---------------------------------------------------------------------------
// Deep clone helper
// ---------------------------------------------------------------------------

function clone(state: GameState): GameState {
  return {
    ...state,
    cityCubes: Object.fromEntries(Object.entries(state.cityCubes).map(([k, v]) => [k, { ...v }])),
    diseaseCubeSupply: { ...state.diseaseCubeSupply },
    diseaseStatus: { ...state.diseaseStatus },
    researchStations: [...state.researchStations],
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    playerDeck: [...state.playerDeck],
    playerDiscard: [...state.playerDiscard],
    infectionDeck: [...state.infectionDeck],
    infectionDiscard: [...state.infectionDiscard],
    log: [...state.log],
  };
}

// ---------------------------------------------------------------------------
// Win / loss checks
// ---------------------------------------------------------------------------

function checkWin(state: GameState): GameState {
  const allCured = DISEASE_COLORS.every((c) => state.diseaseStatus[c] !== "active");
  if (allCured) {
    const s = { ...state, log: [...state.log] };
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
  const s = clone(state);
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

export function applyAction(state: GameState, action: GameAction): GameState {
  if (state.result) return state;

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

  // Actions phase
  if (state.phase !== "actions" || state.actionsRemaining <= 0) return state;

  let s: GameState;
  const pId = state.currentPlayerIndex;

  switch (action.kind) {
    case "drive_ferry":
      s = movePlayer(state, pId, action.to);
      break;

    case "direct_flight": {
      const card = state.players[pId].hand[action.cardIdx] as CityCard;
      s = clone(state);
      s.players[pId].hand.splice(action.cardIdx, 1);
      s.playerDiscard.push(card);
      s = movePlayer(s, pId, card.cityId);
      break;
    }

    case "charter_flight": {
      s = clone(state);
      const matchIdx = s.players[pId].hand.findIndex(
        (c) => c.kind === "city" && c.cityId === s.players[pId].location,
      );
      if (matchIdx >= 0) {
        const [card] = s.players[pId].hand.splice(matchIdx, 1);
        s.playerDiscard.push(card);
      }
      s = movePlayer(s, pId, action.to);
      break;
    }

    case "shuttle_flight":
      s = movePlayer(state, pId, action.to);
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
      s = clone(state);
      s.players[pId].hand.splice(action.cardIdx, 1);
      s.players[pId].usedOpsExpertMove = true;
      s = movePlayer(s, pId, action.to);
      break;
    }

    case "dispatcher_move_to_pawn": {
      const toPawn = state.players[action.toPlayerId];
      s = movePlayer(state, action.targetId, toPawn.location);
      break;
    }

    case "dispatcher_move_as": {
      const ma = action.moveAction;
      const targetLoc = state.players[action.targetId].location;
      s = clone(state);

      if (ma.kind === "drive_ferry") {
        s = movePlayer(s, action.targetId, ma.to);
      } else if (ma.kind === "direct_flight") {
        // Dispatcher uses own hand for direct/charter
        const card = s.players[pId].hand[ma.cardIdx] as CityCard;
        s.players[pId].hand.splice(ma.cardIdx, 1);
        s.playerDiscard.push(card);
        s = movePlayer(s, action.targetId, card.cityId);
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
      } else if (ma.kind === "shuttle_flight") {
        s = movePlayer(s, action.targetId, ma.to);
      }
      break;
    }

    case "contingency_take": {
      s = clone(state);
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
      s = clone(state);
      s.actionsRemaining = 0;
      s.log.push({
        turn: s.turnNumber,
        player: pId,
        message: `Player ${pId} passed remaining actions`,
      });
      break;

    default:
      return state;
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
  const s = clone(state);
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

  return s;
}

function applyTreatDisease(state: GameState, pId: number, color: DiseaseColor): GameState {
  const s = clone(state);
  const player = s.players[pId];
  const loc = player.location;
  const cubes = s.cityCubes[loc][color];
  if (cubes <= 0) return state;

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

  return checkEradication(s, color);
}

function applyShareGive(
  state: GameState,
  giverId: number,
  receiverId: number,
  cardIdx: number,
): GameState {
  const s = clone(state);
  const [card] = s.players[giverId].hand.splice(cardIdx, 1);
  s.players[receiverId].hand.push(card);
  s.players[receiverId].hand = sortHand(s.players[receiverId].hand);

  s.log.push({
    turn: s.turnNumber,
    player: giverId,
    message: `Shared knowledge: gave card to player ${receiverId}`,
  });

  // Receiver may now exceed hand limit — this is handled by the phase system
  if (s.players[receiverId].hand.length > HAND_LIMIT) {
    // The receiving player needs to discard, but we handle this in the UI flow
  }

  return s;
}

function applyShareTake(
  state: GameState,
  takerId: number,
  fromId: number,
  cardIdx: number,
): GameState {
  const s = clone(state);
  const [card] = s.players[fromId].hand.splice(cardIdx, 1);
  s.players[takerId].hand.push(card);
  s.players[takerId].hand = sortHand(s.players[takerId].hand);

  s.log.push({
    turn: s.turnNumber,
    player: takerId,
    message: `Shared knowledge: took card from player ${fromId}`,
  });

  return s;
}

function applyDiscoverCure(
  state: GameState,
  pId: number,
  color: DiseaseColor,
  cardIndices: number[],
): GameState {
  const s = clone(state);
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

  return checkEradication(s, color);
}

// ---------------------------------------------------------------------------
// Discard
// ---------------------------------------------------------------------------

function applyDiscard(state: GameState, cardIdx: number): GameState {
  const s = clone(state);
  const player = s.players[s.currentPlayerIndex];
  if (cardIdx < 0 || cardIdx >= player.hand.length) return state;
  const [card] = player.hand.splice(cardIdx, 1);
  s.playerDiscard.push(card);

  if (player.hand.length <= HAND_LIMIT) {
    s.phase = "infect";
  }

  return s;
}

// ---------------------------------------------------------------------------
// Draw phase
// ---------------------------------------------------------------------------

export function applyDrawPhase(state: GameState): GameState {
  if (state.result) return state;

  const s = clone(state);

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
  drawn.push(s.playerDeck.shift()!);
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

  if (epidemicCount > 0) {
    s.pendingEpidemics = epidemicCount;
    s.phase = "epidemic";
  } else if (player.hand.length > HAND_LIMIT) {
    s.phase = "discard";
  } else {
    s.phase = "infect";
  }

  return s;
}

// ---------------------------------------------------------------------------
// Epidemic resolution
// ---------------------------------------------------------------------------

export function resolveEpidemic(state: GameState): GameState {
  if (state.result) return state;

  let s = clone(state);

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
    const bottomCard = s.infectionDeck.pop()!;
    const cityName = CITY_DATA.get(bottomCard.cityId)?.name ?? bottomCard.cityId;
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: `Epidemic infection: ${cityName} (${bottomCard.color})`,
    });

    s = infectCity(s, bottomCard.cityId, bottomCard.color, 3);
    s.infectionDiscard.push(bottomCard);
  }

  if (s.result) return s;

  // 3. Intensify: shuffle infection discard, place on top
  const reshuffled = shuffle(s.infectionDiscard);
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

  let s = clone(state);

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

    const card = s.infectionDeck.shift()!;
    const cityName = CITY_DATA.get(card.cityId)?.name ?? card.cityId;
    s.log.push({
      turn: s.turnNumber,
      player: s.currentPlayerIndex,
      message: `Infection: ${cityName} (${card.color})`,
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
  const s = clone(state);
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
