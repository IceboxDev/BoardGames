import type { Card } from "./types";
import { DECK_COMPOSITION, HAND_SIZES } from "./types";

export function createDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const [type, count] of Object.entries(DECK_COMPOSITION)) {
    for (let i = 0; i < count; i++) {
      cards.push({ id: id++, type: type as Card["type"] });
    }
  }
  return cards;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHands(
  deck: Card[],
  playerCount: number,
): { hands: Card[][]; remaining: Card[] } {
  const handSize = HAND_SIZES[playerCount];
  const hands: Card[][] = [];
  let offset = 0;
  for (let p = 0; p < playerCount; p++) {
    hands.push(deck.slice(offset, offset + handSize));
    offset += handSize;
  }
  return { hands, remaining: deck.slice(offset) };
}
