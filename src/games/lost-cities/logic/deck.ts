import type { Card } from "./types";
import { EXPEDITION_COLORS } from "./types";
import { shuffleInPlace } from "./utils";

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;

  for (const color of EXPEDITION_COLORS) {
    for (let w = 0; w < 3; w++) {
      cards.push({ id: id++, color, type: "wager", value: 0 });
    }
    for (let v = 2; v <= 10; v++) {
      cards.push({ id: id++, color, type: "number", value: v });
    }
  }

  return cards;
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  shuffleInPlace(copy);
  return copy;
}

export function dealHands(deck: Card[]): {
  playerHand: Card[];
  aiHand: Card[];
  drawPile: Card[];
} {
  return {
    playerHand: deck.slice(0, 8),
    aiHand: deck.slice(8, 16),
    drawPile: deck.slice(16),
  };
}

export function sortHand(hand: Card[]): Card[] {
  const colorOrder = EXPEDITION_COLORS;
  return [...hand].sort((a, b) => {
    const ci = colorOrder.indexOf(a.color) - colorOrder.indexOf(b.color);
    if (ci !== 0) return ci;
    return a.value - b.value;
  });
}
