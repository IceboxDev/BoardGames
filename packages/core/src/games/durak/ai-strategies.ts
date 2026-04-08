import type { Action, AIStrategy, AIStrategyId, Card, GameState } from "./types";
import { AI_STRATEGY_LABELS } from "./types";

// ---------------------------------------------------------------------------
// Strategy registry
// ---------------------------------------------------------------------------

const strategies: Record<AIStrategyId, AIStrategy> = {
  random: { pickAction: pickRandom },
  "heuristic-v1": { pickAction: pickHeuristic },
};

export function getStrategy(id: AIStrategyId): AIStrategy {
  return strategies[id];
}

export const ALL_STRATEGIES: { id: AIStrategyId; label: string }[] = [
  { id: "random", label: AI_STRATEGY_LABELS.random },
  { id: "heuristic-v1", label: AI_STRATEGY_LABELS["heuristic-v1"] },
];

// ---------------------------------------------------------------------------
// Random strategy
// ---------------------------------------------------------------------------

function pickRandom(_state: GameState, legal: Action[]): Action {
  return legal[Math.floor(Math.random() * legal.length)];
}

// ---------------------------------------------------------------------------
// Heuristic v1 strategy
// ---------------------------------------------------------------------------

function pickHeuristic(state: GameState, legal: Action[], player: number): Action {
  const hand = state.players[player].hand;

  if (state.phase === "attacking") {
    return pickAttackHeuristic(state, legal, hand);
  }
  if (state.phase === "defending") {
    return pickDefendHeuristic(state, legal, hand);
  }
  if (state.phase === "throwing-in") {
    return pickThrowInHeuristic(state, legal, hand);
  }

  return legal[0];
}

// ---------------------------------------------------------------------------
// Attack heuristic
// ---------------------------------------------------------------------------

function pickAttackHeuristic(state: GameState, legal: Action[], hand: Card[]): Action {
  const attacks = legal.filter((a): a is Action & { type: "attack" } => a.type === "attack");

  if (attacks.length === 0) {
    // Only "pass" is available
    return { type: "pass" };
  }

  // If we have few cards left and the draw pile is empty, be more conservative
  // (try to pass if we can, to shed cards via successful defense)
  if (state.table.length > 0 && state.drawPile.length === 0 && hand.length <= 2) {
    const pass = legal.find((a) => a.type === "pass");
    if (pass) return pass;
  }

  // Pick lowest non-trump card to attack with
  const cardValues = attacks.map((a) => {
    const card = hand.find((c) => c.id === a.cardId);
    if (!card) throw new Error(`Card ${a.cardId} not found in hand`);
    return { action: a, card, value: cardSortValue(card, state.trumpSuit) };
  });

  cardValues.sort((a, b) => a.value - b.value);
  return cardValues[0].action;
}

// ---------------------------------------------------------------------------
// Defend heuristic
// ---------------------------------------------------------------------------

function pickDefendHeuristic(state: GameState, legal: Action[], hand: Card[]): Action {
  const defends = legal.filter((a): a is Action & { type: "defend" } => a.type === "defend");

  if (defends.length === 0) {
    return { type: "take" };
  }

  // Find undefended attack cards
  const undefended = state.table
    .map((pair, i) => ({ pair, index: i }))
    .filter(({ pair }) => pair.defense === null);

  // Try to defend the cheapest undefended card first with the cheapest defense
  // Group by attack index and find the cheapest defense for each
  const bestDefenses: (Action & { type: "defend" })[] = [];

  for (const { index } of undefended) {
    const options = defends.filter((d) => d.attackIndex === index);
    if (options.length === 0) {
      // Can't defend this one — take
      return { type: "take" };
    }
    const sorted = options
      .map((d) => {
        const card = hand.find((c) => c.id === d.cardId);
        if (!card) throw new Error(`Card ${d.cardId} not found in hand`);
        return { action: d, card };
      })
      .sort(
        (a, b) => cardSortValue(a.card, state.trumpSuit) - cardSortValue(b.card, state.trumpSuit),
      );
    bestDefenses.push(sorted[0].action);
  }

  // Check if we can actually defend ALL undefended cards without reusing cards
  // Use a greedy assignment: defend each undefended card with the cheapest available card
  const usedCardIds = new Set<number>();
  const assignments: (Action & { type: "defend" })[] = [];

  for (const { index } of undefended) {
    const options = defends
      .filter((d) => d.attackIndex === index && !usedCardIds.has(d.cardId))
      .map((d) => {
        const card = hand.find((c) => c.id === d.cardId);
        if (!card) throw new Error(`Card ${d.cardId} not found in hand`);
        return { action: d, card };
      })
      .sort(
        (a, b) => cardSortValue(a.card, state.trumpSuit) - cardSortValue(b.card, state.trumpSuit),
      );

    if (options.length === 0) {
      // Can't fully defend — take everything
      return { type: "take" };
    }
    usedCardIds.add(options[0].action.cardId);
    assignments.push(options[0].action);
  }

  // If we would need to use high trumps to defend low non-trump cards, consider taking
  // (only when draw pile has cards and we'd waste multiple trumps)
  if (state.drawPile.length > 0) {
    const trumpCost = assignments.reduce((sum, a) => {
      const card = hand.find((c) => c.id === a.cardId);
      if (!card) throw new Error(`Card ${a.cardId} not found in hand`);
      return sum + (card.suit === state.trumpSuit ? 1 : 0);
    }, 0);
    const totalAttackValue = undefended.reduce((sum, { pair }) => sum + pair.attack.rank, 0);
    // If we'd use 2+ trumps to defend weak cards, just take
    if (trumpCost >= 2 && totalAttackValue < 20 && hand.length > 3) {
      return { type: "take" };
    }
  }

  // Defend the first undefended card
  return assignments[0];
}

// ---------------------------------------------------------------------------
// Throw-in heuristic
// ---------------------------------------------------------------------------

function pickThrowInHeuristic(state: GameState, legal: Action[], hand: Card[]): Action {
  const throwIns = legal.filter((a): a is Action & { type: "throw-in" } => a.type === "throw-in");

  if (throwIns.length === 0) {
    return { type: "pass" };
  }

  // Throw in the cheapest non-trump matching card
  const sorted = throwIns
    .map((a) => {
      const card = hand.find((c) => c.id === a.cardId);
      if (!card) throw new Error(`Card ${a.cardId} not found in hand`);
      return { action: a, card };
    })
    .sort(
      (a, b) => cardSortValue(a.card, state.trumpSuit) - cardSortValue(b.card, state.trumpSuit),
    );

  const cheapest = sorted[0];

  // Don't throw in trumps unless we have many or end-game
  if (cheapest.card.suit === state.trumpSuit && state.drawPile.length > 0 && hand.length > 2) {
    return { type: "pass" };
  }

  return cheapest.action;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lower value = cheaper to play. Non-trump cards are cheaper than trump. */
function cardSortValue(card: Card, trumpSuit: string): number {
  const trumpBonus = card.suit === trumpSuit ? 100 : 0;
  return card.rank + trumpBonus;
}
