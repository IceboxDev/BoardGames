import { ALL_CITY_IDS, CITY_DATA } from "./city-graph";
import {
  buildCityCards,
  buildEventCards,
  buildInfectionDeck,
  buildPlayerDeck,
  dealHands,
  shuffle,
  sortHand,
} from "./deck";
import type {
  ActionLogEntry,
  DiseaseColor,
  GameState,
  LogEntry,
  PlayerState,
  Role,
  SetupConfig,
} from "./types";
import { ACTIONS_PER_TURN, emptyCubeCounts, MAX_CUBES_PER_COLOR } from "./types";

const ALL_ROLES: Role[] = [
  "contingency_planner",
  "dispatcher",
  "medic",
  "operations_expert",
  "quarantine_specialist",
  "scientist",
  "researcher",
];

export function createGame(config: SetupConfig): GameState {
  const { numPlayers, difficulty } = config;

  // 1. Initialize city cubes
  const cityCubes: Record<string, Record<DiseaseColor, number>> = {};
  for (const cityId of ALL_CITY_IDS) {
    cityCubes[cityId] = emptyCubeCounts();
  }

  // 2. Research station in Atlanta
  const researchStations = ["Atlanta"];

  // 3. Disease cube supply
  const diseaseCubeSupply: Record<DiseaseColor, number> = {
    blue: MAX_CUBES_PER_COLOR,
    yellow: MAX_CUBES_PER_COLOR,
    black: MAX_CUBES_PER_COLOR,
    red: MAX_CUBES_PER_COLOR,
  };

  // 4. Disease status, tracks
  const diseaseStatus: Record<DiseaseColor, "active"> = {
    blue: "active",
    yellow: "active",
    black: "active",
    red: "active",
  };

  // 5. Assign roles
  const roles = shuffle(ALL_ROLES).slice(0, numPlayers);

  // 6. Create players in Atlanta
  const players: PlayerState[] = roles.map((role, i) => ({
    id: i,
    role,
    hand: [],
    location: "Atlanta",
    usedOpsExpertMove: false,
  }));

  // 7. Build infection deck
  const infectionDeck = buildInfectionDeck();
  const infectionDiscard: typeof infectionDeck = [];

  // 8. Initial infection: draw 9 cards
  const log: LogEntry[] = [];
  const actionLog: ActionLogEntry[] = [];
  const cubeAmounts = [3, 3, 3, 2, 2, 2, 1, 1, 1];

  for (let i = 0; i < 9; i++) {
    const card = infectionDeck.shift();
    if (!card) throw new Error("Infection deck exhausted during setup");
    const count = cubeAmounts[i];
    cityCubes[card.cityId][card.color] += count;
    diseaseCubeSupply[card.color] -= count;
    infectionDiscard.push(card);
    const cityName = CITY_DATA.get(card.cityId)?.name ?? card.cityId;
    log.push({
      turn: 0,
      player: -1,
      message: `Setup: ${cityName} infected with ${count} ${card.color} cube${count > 1 ? "s" : ""}`,
    });
    actionLog.push({
      turn: 0,
      playerIndex: -1,
      action: "infect",
      city: cityName,
      disease: card.color,
      detail: `${count} cube${count > 1 ? "s" : ""}`,
    });
  }

  // 9. Build player deck
  const baseCards = [...buildCityCards(), ...buildEventCards()];
  const [hands, remaining] = dealHands(baseCards, numPlayers);

  for (let i = 0; i < numPlayers; i++) {
    players[i].hand = sortHand(hands[i]);
  }

  const playerDeck = buildPlayerDeck(remaining, difficulty);

  // 10. Determine first player (highest population city card)
  let firstPlayer = 0;
  let highestPop = -1;

  for (const player of players) {
    for (const card of player.hand) {
      if (card.kind === "city") {
        const pop = CITY_DATA.get(card.cityId)?.population ?? 0;
        if (pop > highestPop) {
          highestPop = pop;
          firstPlayer = player.id;
        }
      }
    }
  }

  return {
    cityCubes,
    researchStations,
    diseaseCubeSupply,
    diseaseStatus,

    outbreakCount: 0,
    infectionRateIndex: 0,

    playerDeck,
    playerDiscard: [],
    infectionDeck,
    infectionDiscard,

    players,
    currentPlayerIndex: firstPlayer,
    actionsRemaining: ACTIONS_PER_TURN,
    phase: "actions",

    contingencyCard: null,
    skipNextInfect: false,
    pendingEpidemics: 0,
    preForecastPhase: null,
    discardingPlayerIndex: null,
    preDiscardPhase: null,

    difficulty,
    result: null,
    turnNumber: 1,
    log,
    actionLog,
  };
}
