import type { GameState, SushiGoAction } from "./types";

export function getActivePlayer(state: GameState): number {
  if (state.phase === "selecting") return -1; // simultaneous
  return 0;
}

export function getLegalActions(state: GameState, playerIndex: number): SushiGoAction[] {
  if (state.phase !== "selecting") return [];
  if (state.selections[playerIndex] !== null) return [];

  const hand = state.players[playerIndex].hand;
  const actions: SushiGoAction[] = [];

  for (const card of hand) {
    actions.push({ type: "select-card", cardId: card.id });
  }

  // Chopsticks: can pick 2 cards if chopsticks in tableau
  const hasChopsticks = state.players[playerIndex].tableau.some((c) => c.type === "chopsticks");
  if (hasChopsticks && hand.length >= 2) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        actions.push({
          type: "select-with-chopsticks",
          cardId: hand[i].id,
          secondCardId: hand[j].id,
        });
      }
    }
  }

  return actions;
}
