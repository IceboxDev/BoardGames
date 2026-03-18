import type { GameState } from "../types";
import { EXPEDITION_COLORS } from "../types";
import { shuffleInPlace } from "../utils";
import { type FastState, NUM_CARDS } from "./types";

/**
 * Build a set of all card IDs known to the AI:
 * - AI's own hand
 * - Both players' expedition cards (public)
 * - All discard pile cards (public)
 */
function collectKnownCardIds(state: GameState): Set<number> {
  const known = new Set<number>();

  for (const c of state.aiHand) known.add(c.id);

  for (const color of EXPEDITION_COLORS) {
    for (const c of state.playerExpeditions[color]) known.add(c.id);
    for (const c of state.aiExpeditions[color]) known.add(c.id);
    for (const c of state.discardPiles[color]) known.add(c.id);
  }

  return known;
}

/**
 * Produce a FastState by determinizing the hidden information.
 *
 * The AI knows its own hand, all public cards (expeditions + discard piles),
 * and the draw pile size. It does NOT know which specific cards the opponent
 * holds or the draw pile ordering. We randomly assign unknown cards to fill
 * those slots.
 */
export function determinize(state: GameState): FastState {
  const knownIds = collectKnownCardIds(state);

  // Collect unknown card IDs (opponent hand + draw pile cards)
  const unknownIds: number[] = [];
  for (let id = 0; id < NUM_CARDS; id++) {
    if (!knownIds.has(id)) unknownIds.push(id);
  }

  shuffleInPlace(unknownIds);

  const opponentHandSize = state.playerHand.length;
  const opponentHand = unknownIds.slice(0, opponentHandSize);
  const drawPile = unknownIds.slice(opponentHandSize);

  // Build expeditions: indices 0-4 = player (human), 5-9 = AI
  const expeditions: number[][] = [];
  for (const color of EXPEDITION_COLORS) {
    expeditions.push(state.playerExpeditions[color].map((c) => c.id));
  }
  for (const color of EXPEDITION_COLORS) {
    expeditions.push(state.aiExpeditions[color].map((c) => c.id));
  }

  // Build discard piles
  const discardPiles: number[][] = [];
  for (const color of EXPEDITION_COLORS) {
    discardPiles.push(state.discardPiles[color].map((c) => c.id));
  }

  const colorIndex = (c: string) =>
    EXPEDITION_COLORS.indexOf(c as (typeof EXPEDITION_COLORS)[number]);

  return {
    drawPile,
    discardPiles,
    expeditions,
    hands: [opponentHand, state.aiHand.map((c) => c.id)],
    currentPlayer: state.currentPlayer === "ai" ? 1 : 0,
    turnPhase: state.turnPhase === "play" ? 0 : 1,
    lastDiscardedColor:
      state.lastDiscardedColor != null ? colorIndex(state.lastDiscardedColor) : -1,
    gameOver: false,
  };
}

/**
 * Re-determinize an existing FastState in-place by reshuffling the unknown
 * cards (opponent hand + draw pile) while preserving the AI hand and all
 * public information. Used at the start of each MCTS iteration.
 */
export function redeterminize(s: FastState, aiPlayer: number): void {
  const opponent = 1 - aiPlayer;

  // Pool together opponent hand + draw pile
  const pool = [...s.hands[opponent], ...s.drawPile];
  shuffleInPlace(pool);

  const oppHandSize = s.hands[opponent].length;
  s.hands[opponent] = pool.slice(0, oppHandSize);
  s.drawPile = pool.slice(oppHandSize);
}
