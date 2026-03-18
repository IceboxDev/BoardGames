import { CITY_DATA } from "./city-graph";
import { applyMedicAutoRemove } from "./infection";
import type {
  AirliftParams,
  EventParams,
  EventType,
  GameState,
  GovernmentGrantParams,
  ResilientPopulationParams,
} from "./types";
import { MAX_RESEARCH_STATIONS } from "./types";

function cloneState(state: GameState): GameState {
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

function removeEventFromHand(state: GameState, playerId: number, event: EventType): GameState {
  const s = cloneState(state);
  const player = s.players[playerId];
  const idx = player.hand.findIndex((c) => c.kind === "event" && c.event === event);

  if (idx >= 0) {
    const [card] = player.hand.splice(idx, 1);
    s.playerDiscard.push(card);
  } else if (s.contingencyCard && s.contingencyCard.event === event) {
    // Contingency Planner's stored event is removed from game, not discarded
    s.contingencyCard = null;
  }

  return s;
}

export function applyEvent(
  state: GameState,
  playerId: number,
  event: EventType,
  params: EventParams,
): GameState {
  let s = removeEventFromHand(state, playerId, event);

  switch (event) {
    case "airlift": {
      const p = params as AirliftParams;
      const target = s.players[p.targetPlayerId];
      target.location = p.destination;
      const cityName = CITY_DATA.get(p.destination)?.name ?? p.destination;
      s.log.push({
        turn: s.turnNumber,
        player: playerId,
        message: `Airlift: moved player ${p.targetPlayerId} to ${cityName}`,
      });
      s = applyMedicAutoRemove(s);
      break;
    }

    case "one_quiet_night": {
      s.skipNextInfect = true;
      s.log.push({
        turn: s.turnNumber,
        player: playerId,
        message: "One Quiet Night: next infection step will be skipped",
      });
      break;
    }

    case "government_grant": {
      const p = params as GovernmentGrantParams;
      if (p.relocateFrom && s.researchStations.length >= MAX_RESEARCH_STATIONS) {
        s.researchStations = s.researchStations.filter((r) => r !== p.relocateFrom);
      }
      s.researchStations.push(p.cityId);
      const cityName = CITY_DATA.get(p.cityId)?.name ?? p.cityId;
      s.log.push({
        turn: s.turnNumber,
        player: playerId,
        message: `Government Grant: built research station in ${cityName}`,
      });
      break;
    }

    case "resilient_population": {
      const p = params as ResilientPopulationParams;
      const removed = s.infectionDiscard.splice(p.infectionDiscardIdx, 1)[0];
      if (removed) {
        const cityName = CITY_DATA.get(removed.cityId)?.name ?? removed.cityId;
        s.log.push({
          turn: s.turnNumber,
          player: playerId,
          message: `Resilient Population: removed ${cityName} from infection discard`,
        });
      }
      break;
    }

    case "forecast": {
      s.phase = "forecast";
      s.log.push({
        turn: s.turnNumber,
        player: playerId,
        message: "Forecast: rearranging top 6 infection cards",
      });
      break;
    }
  }

  return s;
}

export function applyForecastReorder(state: GameState, newOrder: number[]): GameState {
  const s = cloneState(state);
  const top6 = s.infectionDeck.splice(0, Math.min(6, s.infectionDeck.length));
  const reordered = newOrder.map((i) => top6[i]);
  s.infectionDeck.unshift(...reordered);
  // Return to whatever phase was active before forecast
  // Forecast can be played during actions, draw, or infect phases
  // We'll return to actions as the most common case; the engine handles this
  s.phase = "actions";
  return s;
}

export function getEventName(event: EventType): string {
  switch (event) {
    case "airlift":
      return "Airlift";
    case "one_quiet_night":
      return "One Quiet Night";
    case "resilient_population":
      return "Resilient Population";
    case "government_grant":
      return "Government Grant";
    case "forecast":
      return "Forecast";
  }
}
