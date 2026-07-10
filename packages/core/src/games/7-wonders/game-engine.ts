import type { Rng } from "../../lib/rng";
import { createRng } from "../../lib/rng";
import { assignWonders, buildAgeDeck, dealHands } from "./deck";
import type { GameState, PlayerState, SevenWondersConfig } from "./types";
import { STARTING_COINS } from "./types";

export function createInitialState(config: SevenWondersConfig, rng?: Rng): GameState {
  const { playerCount, seed, sideMode } = config;
  if (playerCount < 3 || playerCount > 7) {
    throw new Error(`7 Wonders supports 3-7 players, got ${playerCount}`);
  }
  const rand = rng ?? createRng(seed);

  const wonders = assignWonders(playerCount, rand, sideMode);
  const players: PlayerState[] = wonders.map(({ wonderId, side }) => ({
    wonderId,
    side,
    stagesBuilt: 0,
    coins: STARTING_COINS,
    tableau: [],
    militaryTokens: [],
    freeBuildUsedThisAge: false,
  }));

  // All three decks are shuffled up front so the whole game is a pure
  // function of (seed, config, actions).
  const hands = dealHands(buildAgeDeck(1, playerCount, rand), playerCount);
  const ageDecks = {
    2: buildAgeDeck(2, playerCount, rand),
    3: buildAgeDeck(3, playerCount, rand),
  };

  return {
    seed,
    playerCount,
    age: 1,
    turn: 1,
    phase: "selecting",
    players,
    hands,
    selections: players.map(() => null),
    discard: [],
    pendingQueue: [],
    ageDecks,
    lastRevealed: [],
    actionLog: [{ type: "age-start", age: 1 }],
  };
}
