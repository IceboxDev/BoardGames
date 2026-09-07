import { createRng, type Rng, shuffle } from "../../lib/rng";
import { cardsPerRound } from "./map";
import type { CardId, Clan, ClanCardId, NinjaId, Rank } from "./types";
import { CLANS, RANKS } from "./types";

// ---------------------------------------------------------------------------
// The 54-card Battle for Japan deck
// ---------------------------------------------------------------------------

export const NINJAS: readonly NinjaId[] = ["ninja-wood", "ninja-jade"];

export const FULL_DECK: readonly CardId[] = [
  ...CLANS.flatMap((clan) => RANKS.map((rank): ClanCardId => `${clan}-${rank}`)),
  ...NINJAS,
];

export function isNinja(card: CardId): card is NinjaId {
  return card === "ninja-wood" || card === "ninja-jade";
}

export function isClan(value: string): value is Clan {
  return (CLANS as readonly string[]).includes(value);
}

/** The card's clan (suit), or `null` for a Ninja. */
export function suitOf(card: CardId): Clan | null {
  if (isNinja(card)) return null;
  const dash = card.indexOf("-");
  const clan = card.slice(0, dash);
  return isClan(clan) ? clan : null;
}

/** Rank 2..14 for clan cards; 0 for a Ninja (never compared by rank). */
export function rankOf(card: CardId): number {
  if (isNinja(card)) return 0;
  return Number(card.slice(card.indexOf("-") + 1));
}

export function isValidCardId(value: unknown): value is CardId {
  return typeof value === "string" && (FULL_DECK as readonly string[]).includes(value);
}

/**
 * Strength for the AI's "cheapest card that does X" ordering. Trump cards sit
 * above every plain card, Ninjas above every trump, Jade above Wood.
 */
export function cardStrength(card: CardId, trump: Clan): number {
  if (card === "ninja-jade") return 200;
  if (card === "ninja-wood") return 100;
  const rank = rankOf(card);
  return suitOf(card) === trump ? 50 + rank : rank;
}

/** Suit blocks in CLANS order (trump first when given), ranks descending, Ninjas last. */
export function sortHand(hand: readonly CardId[], trump?: Clan): CardId[] {
  const order: (Clan | null)[] = trump
    ? [trump, ...CLANS.filter((c) => c !== trump), null]
    : [...CLANS, null];
  return [...hand].sort((a, b) => {
    const sa = order.indexOf(suitOf(a));
    const sb = order.indexOf(suitOf(b));
    if (sa !== sb) return sa - sb;
    return rankOf(b) - rankOf(a);
  });
}

// ---------------------------------------------------------------------------
// Seed-derived randomness. The seed is the only random input to a game, so
// every deal and both advantage rows are reconstructible and — because the
// second row is not materialised until round 5 — un-leakable.
// ---------------------------------------------------------------------------

export function setupRng(seed: number): Rng {
  return createRng((seed ^ 0x5e75) | 0);
}

export function roundRng(seed: number, round: number): Rng {
  return createRng((seed ^ Math.imul(round + 1, 0x9e3779b9)) | 0);
}

export function rowRng(seed: number, half: 1 | 2): Rng {
  return createRng((seed ^ Math.imul(half, 0x0a11c0de)) | 0);
}

/** Deal `cardsPerRound` cards to each seat from a fresh shuffle of the full deck. */
export function deal(seed: number, round: number, playerCount: number): CardId[][] {
  const per = cardsPerRound(playerCount, round);
  if (per * playerCount > FULL_DECK.length) {
    throw new Error(`Cannot deal ${per} cards to ${playerCount} players`);
  }
  const shuffled = shuffle(FULL_DECK, roundRng(seed, round));
  const hands: CardId[][] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    hands.push(shuffled.slice(seat * per, (seat + 1) * per));
  }
  return hands;
}

export type { Rank };
