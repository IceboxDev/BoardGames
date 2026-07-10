import type { Rng } from "../../lib/rng";
import { shuffle } from "../../lib/rng";
import { CARDS, GUILDS } from "./cards";
import type { Age, CardId, WonderId } from "./types";
import { makeCardId, WONDER_IDS } from "./types";

/** All physical card instances for one age at a given player count. */
function ageCardIds(age: Age, playerCount: number): CardId[] {
  const ids: CardId[] = [];
  for (const card of CARDS) {
    if (card.age !== age) continue;
    card.copies.forEach((minPlayers, copyIndex) => {
      if (minPlayers <= playerCount) ids.push(makeCardId(card.name, age, copyIndex));
    });
  }
  return ids;
}

/**
 * Build the shuffled deck for an age. Age III mixes in (playerCount + 2)
 * randomly drawn guilds; the rest of the guilds stay out of the game.
 */
export function buildAgeDeck(age: Age, playerCount: number, rng: Rng): CardId[] {
  const ids = ageCardIds(age, playerCount);
  if (age === 3) {
    const guildIds = GUILDS.map((g) => makeCardId(g.name, 3, 0));
    ids.push(...shuffle(guildIds, rng).slice(0, playerCount + 2));
  }
  return shuffle(ids, rng);
}

/** Deal 7 cards to each player. The deck must contain exactly 7 * playerCount cards. */
export function dealHands(deck: readonly CardId[], playerCount: number): CardId[][] {
  if (deck.length !== 7 * playerCount) {
    throw new Error(`Deck has ${deck.length} cards, expected ${7 * playerCount}`);
  }
  const hands: CardId[][] = [];
  for (let p = 0; p < playerCount; p++) {
    hands.push(deck.slice(p * 7, (p + 1) * 7));
  }
  return hands;
}

export interface WonderAssignment {
  wonderId: WonderId;
  side: "A" | "B";
}

/** Randomly assign each player a distinct wonder, with the requested side mode. */
export function assignWonders(
  playerCount: number,
  rng: Rng,
  sideMode: "A" | "B" | "random",
): WonderAssignment[] {
  const ids = shuffle(WONDER_IDS, rng).slice(0, playerCount);
  return ids.map((wonderId) => ({
    wonderId,
    side: sideMode === "random" ? (rng() < 0.5 ? "A" : "B") : sideMode,
  }));
}
