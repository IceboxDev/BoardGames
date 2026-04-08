import type { Card, Rank, Suit } from "./types";
import { ALL_RANKS, ALL_SUITS } from "./types";

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      cards.push({ id, suit, rank });
      id++;
    }
  }
  return cards;
}

export function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

const SUIT_ORDER: Record<Suit, number> = {
  spades: 0,
  clubs: 1,
  diamonds: 2,
  hearts: 3,
};

/** Sort hand by suit then rank, with trump suit grouped last. */
export function sortHand(hand: Card[], trumpSuit: Suit): Card[] {
  return [...hand].sort((a, b) => {
    const aIsTrump = a.suit === trumpSuit ? 1 : 0;
    const bIsTrump = b.suit === trumpSuit ? 1 : 0;
    if (aIsTrump !== bIsTrump) return aIsTrump - bIsTrump;
    const suitDiff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return a.rank - b.rank;
  });
}

/** Find the player with the lowest trump card. Returns player index, or 0 if nobody has trump. */
export function findFirstAttacker(hands: Card[][], trumpSuit: Suit): number {
  let lowestRank: Rank | null = null;
  let lowestPlayer = 0;

  for (let i = 0; i < hands.length; i++) {
    for (const card of hands[i]) {
      if (card.suit === trumpSuit) {
        if (lowestRank === null || card.rank < lowestRank) {
          lowestRank = card.rank;
          lowestPlayer = i;
        }
      }
    }
  }

  return lowestPlayer;
}
