// Deals a fresh Quiztopia table. Every random choice goes through the rng so
// a seed reproduces the exact deal (the machine derives the rng from the
// START seed; tests hand in their own).

import { createRng, type Rng, randomSeed, shuffle } from "../../lib/rng.ts";
import { helpDeckFor } from "./help-cards.ts";
import type { QuestionSource } from "./question-source.ts";
import { freshTurn } from "./rules.ts";
import {
  BUILDING_COUNT,
  type BuildingStatus,
  CARDS_PER_GAME,
  type QuiztopiaGameState,
  type QuiztopiaStartConfig,
  TIP_CARDS_BY_TIER,
} from "./types.ts";

export interface CreateGameDeps {
  source: QuestionSource;
  /** Defaults to an rng seeded from `config.seed` (or a fresh random seed). */
  rng?: Rng;
}

export function createGame(config: QuiztopiaStartConfig, deps: CreateGameDeps): QuiztopiaGameState {
  const { playerCount } = config;
  const seed = config.seed ?? randomSeed();
  const rng = deps.rng ?? createRng(seed);
  const seats = config.seats ?? Array.from({ length: playerCount }, (_, i) => i);
  if (seats.length !== playerCount || new Set(seats).size !== seats.length) {
    throw new Error("seats must list playerCount distinct seat indices");
  }
  // Solo has no tip cards: nobody else at the table could flip one.
  const expert = playerCount > 1 && config.expert;

  const refs = deps.source.listCardRefs(config.deck);
  if (refs.length < CARDS_PER_GAME) {
    throw new Error(`deck "${config.deck}" has ${refs.length} cards, needs ${CARDS_PER_GAME}`);
  }

  // Rulebook: players + 2 buildings start dark, the rest bright.
  const order = shuffle(
    Array.from({ length: BUILDING_COUNT }, (_, i) => i),
    rng,
  );
  const buildings = Array.from({ length: BUILDING_COUNT }, (): BuildingStatus => "bright");
  for (const i of order.slice(0, playerCount + 2)) buildings[i] = "dark";

  const drawPile = shuffle(refs, rng).slice(0, CARDS_PER_GAME);
  const helpDeck = shuffle(helpDeckFor(playerCount), rng).map((id) => ({ id, used: false }));
  const tipTotal = TIP_CARDS_BY_TIER[config.difficulty] ?? TIP_CARDS_BY_TIER[3];

  const first = seats[0];
  return {
    playerCount,
    seats: [...seats],
    difficulty: config.difficulty,
    expert,
    deck: config.deck,
    seed,
    language: config.language ?? null,
    phase: "choose-building",
    buildings,
    drawPile,
    cardsUsed: 0,
    helpDeck,
    helpOpen: 1,
    tipCards: expert ? { total: tipTotal, active: tipTotal } : null,
    // ASSUMED: the lowest listed seat opens; the rulebook leaves it to the table.
    turn: freshTurn(seats, first, 1),
    bakery: false,
    bakeryComplete: false,
    lastResolution: null,
    questionLog: [],
    outcome: null,
  };
}
