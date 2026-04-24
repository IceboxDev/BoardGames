import type { Rng } from "./rng";
import type { Card, CardType } from "./types";
import { DECK_COMPOSITION } from "./types";

export function shuffleInPlace<T>(arr: T[], rng: Rng = Math.random): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  shuffleInPlace(a, rng);
  return a;
}

export function buildFullDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const [type, count] of Object.entries(DECK_COMPOSITION)) {
    for (let i = 0; i < count; i++) {
      cards.push({ id: id++, type: type as CardType });
    }
  }
  return cards;
}

/**
 * Official Exploding Kittens setup:
 * 1. Remove all Exploding Kittens and Defuse cards.
 * 2. Shuffle the remaining 44 cards.
 * 3. Deal 7 cards to each player.
 * 4. Give each player 1 Defuse card (8 cards total per player).
 * 5. Insert (playerCount - 1) Exploding Kittens into the remaining deck.
 * 6. For 2-3 players, extra Defuse cards go back into the deck.
 * 7. Shuffle the final deck.
 */
export function dealGame(
  playerCount: number,
  rng: Rng = Math.random,
): {
  players: { hand: Card[] }[];
  drawPile: Card[];
} {
  if (playerCount < 2 || playerCount > 5) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2-5.`);
  }

  const allCards = buildFullDeck();

  const kittens = allCards.filter((c) => c.type === "exploding-kitten");
  const defuses = allCards.filter((c) => c.type === "defuse");
  const rest = allCards.filter((c) => c.type !== "exploding-kitten" && c.type !== "defuse");

  const shuffledRest = shuffle(rest, rng);

  const players: { hand: Card[] }[] = [];
  let dealIndex = 0;

  for (let p = 0; p < playerCount; p++) {
    const hand = shuffledRest.slice(dealIndex, dealIndex + 7);
    hand.push(defuses[p]);
    players.push({ hand });
    dealIndex += 7;
  }

  const remaining = shuffledRest.slice(dealIndex);

  const extraDefuses = defuses.slice(playerCount);
  const kittensToInsert = kittens.slice(0, playerCount - 1);

  const drawPile = shuffle([...remaining, ...extraDefuses, ...kittensToInsert], rng);

  return { players, drawPile };
}

export function sortHand(hand: Card[]): Card[] {
  const typeOrder: CardType[] = [
    "defuse",
    "attack",
    "skip",
    "favor",
    "shuffle",
    "see-the-future",
    "nope",
    "tacocat",
    "cattermelon",
    "potato-cat",
    "beard-cat",
    "rainbow-ralphing-cat",
    "exploding-kitten",
  ];
  return [...hand].sort((a, b) => {
    return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
  });
}
