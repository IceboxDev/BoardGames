import type { GameState, PlayerIndex } from "../types";
import { EXPEDITION_COLORS, opponent } from "../types";
import { shuffleInPlace } from "../utils";
import { canPlayToExpedition } from "./fast-game";
import { CARD_INFO, type FastState, NUM_CARDS, NUM_COLORS } from "./types";

function collectKnownCardIds(state: GameState, forPlayer: PlayerIndex): Set<number> {
  const known = new Set<number>();

  for (const c of state.hands[forPlayer]) known.add(c.id);

  for (const p of [0, 1] as const) {
    for (const color of EXPEDITION_COLORS) {
      for (const c of state.expeditions[p][color]) known.add(c.id);
    }
  }

  for (const color of EXPEDITION_COLORS) {
    for (const c of state.discardPiles[color]) known.add(c.id);
  }

  // Cards we know the opponent holds (drawn from discard in front of us)
  for (const id of state.knownOpponentCards[forPlayer]) known.add(id);

  return known;
}

/**
 * Produce a FastState by determinizing the hidden information from the
 * perspective of `forPlayer`. The player knows their own hand and all
 * public cards (expeditions + discard piles). Unknown cards (opponent
 * hand + draw pile) are randomly assigned, but known opponent cards are pinned.
 */
export function determinize(state: GameState, forPlayer: PlayerIndex): FastState {
  const opp = opponent(forPlayer);
  const knownIds = collectKnownCardIds(state, forPlayer);

  // Known cards the opponent drew from discard (still in their hand)
  const knownOppCards = state.knownOpponentCards[forPlayer].filter((id) =>
    state.hands[opp].some((c) => c.id === id),
  );

  const unknownIds: number[] = [];
  for (let id = 0; id < NUM_CARDS; id++) {
    if (!knownIds.has(id)) unknownIds.push(id);
  }

  shuffleInPlace(unknownIds);

  const opponentHandSize = state.hands[opp].length;
  const freeSlots = opponentHandSize - knownOppCards.length;
  const opponentHand = [...knownOppCards, ...unknownIds.slice(0, freeSlots)];
  const drawPile = unknownIds.slice(freeSlots);

  const expeditions: number[][] = [];
  for (const p of [0, 1] as const) {
    for (const color of EXPEDITION_COLORS) {
      expeditions.push(state.expeditions[p][color].map((c) => c.id));
    }
  }

  const discardPiles: number[][] = [];
  for (const color of EXPEDITION_COLORS) {
    discardPiles.push(state.discardPiles[color].map((c) => c.id));
  }

  const colorIndex = (c: string) =>
    EXPEDITION_COLORS.indexOf(c as (typeof EXPEDITION_COLORS)[number]);

  const hands: [number[], number[]] = [[], []];
  hands[forPlayer] = state.hands[forPlayer].map((c) => c.id);
  hands[opp] = opponentHand;

  return {
    drawPile,
    discardPiles,
    expeditions,
    hands,
    currentPlayer: state.currentPlayer,
    turnPhase: state.turnPhase === "play" ? 0 : 1,
    lastDiscardedColor:
      state.lastDiscardedColor != null ? colorIndex(state.lastDiscardedColor) : -1,
    gameOver: false,
    pinnedOpponentCards: knownOppCards,
  };
}

/**
 * Re-determinize an existing FastState in-place by reshuffling the unknown
 * cards (opponent hand + draw pile) while preserving the AI hand and all
 * public information. Uses Fisher-Yates across both arrays without allocations.
 */
export function redeterminize(s: FastState, aiPlayer: number): void {
  const opponentIdx = 1 - aiPlayer;
  const oppHand = s.hands[opponentIdx];
  const draw = s.drawPile;
  const oppLen = oppHand.length;
  const drawLen = draw.length;
  const total = oppLen + drawLen;

  if (s.pinnedOpponentCards.length > 0) {
    redeterminizeWithPinning(s, opponentIdx, s.pinnedOpponentCards);
    return;
  }

  const oppOffset = opponentIdx * NUM_COLORS;

  // Fisher-Yates with rejection sampling
  for (let attempt = 0; attempt <= MAX_REJECTION_RETRIES; attempt++) {
    for (let i = total - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const vi = i < oppLen ? oppHand[i] : draw[i - oppLen];
      const vj = j < oppLen ? oppHand[j] : draw[j - oppLen];
      if (i < oppLen) oppHand[i] = vj;
      else draw[i - oppLen] = vj;
      if (j < oppLen) oppHand[j] = vi;
      else draw[j - oppLen] = vi;
    }

    if (
      attempt < MAX_REJECTION_RETRIES &&
      hasUnlikelyCards(oppHand, 0, oppLen, s.expeditions, oppOffset)
    ) {
      continue;
    }
    break;
  }
}

const MAX_REJECTION_RETRIES = 5;

/**
 * Check if the opponent hand contains cards a rational player would have
 * already played (e.g. next sequential card for their expedition).
 * Returns true if the hand looks "unlikely".
 */
function hasUnlikelyCards(
  hand: number[],
  startIdx: number,
  count: number,
  expeditions: number[][],
  oppOffset: number,
): boolean {
  for (let i = startIdx; i < startIdx + count; i++) {
    const cardId = hand[i];
    const info = CARD_INFO[cardId];
    const exp = expeditions[oppOffset + info.color];
    if (exp.length === 0) continue;

    // If opponent has expedition and this card is immediately playable (next in sequence)
    if (canPlayToExpedition(cardId, exp)) {
      const lastInfo = CARD_INFO[exp[exp.length - 1]];
      // Only flag as unlikely if it's the direct next value (V+1 or V+2)
      if (info.type === 1 && lastInfo.type === 1 && info.value <= lastInfo.value + 2) {
        return true;
      }
      // Wager when expedition already has wagers — they'd have played it
      if (info.type === 0 && lastInfo.type === 0) {
        return true;
      }
    }
  }
  return false;
}

function redeterminizeWithPinning(s: FastState, opponentIdx: number, pinnedCards: number[]): void {
  const oppHand = s.hands[opponentIdx];
  const draw = s.drawPile;
  const oppOffset = opponentIdx * NUM_COLORS;

  const pinnedSet = new Set(pinnedCards);
  const pool: number[] = [];
  const keptInHand: number[] = [];

  for (const c of oppHand) {
    if (pinnedSet.has(c)) keptInHand.push(c);
    else pool.push(c);
  }
  for (const c of draw) pool.push(c);

  const neededForHand = oppHand.length - keptInHand.length;
  const pinnedCount = keptInHand.length;

  // Write pinned cards first
  for (let i = 0; i < pinnedCount; i++) oppHand[i] = keptInHand[i];

  // Rejection sampling: reshuffle if hand contains unlikely cards
  for (let attempt = 0; attempt <= MAX_REJECTION_RETRIES; attempt++) {
    shuffleInPlace(pool);
    for (let i = 0; i < neededForHand; i++) oppHand[pinnedCount + i] = pool[i];

    if (
      attempt < MAX_REJECTION_RETRIES &&
      hasUnlikelyCards(oppHand, pinnedCount, neededForHand, s.expeditions, oppOffset)
    ) {
      continue;
    }
    break;
  }

  for (let i = 0; i < draw.length; i++) draw[i] = pool[neededForHand + i];
}
