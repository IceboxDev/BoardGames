import type {
  Card,
  DiscardPiles,
  DrawAction,
  ExpeditionColor,
  Expeditions,
  PlayAction,
} from "./types";
import { EXPEDITION_COLORS } from "./types";

export function canPlayToExpedition(card: Card, expedition: Card[]): boolean {
  if (expedition.length === 0) return true;

  const last = expedition[expedition.length - 1];

  if (card.type === "wager") {
    // Wagers only before any number cards
    return last.type === "wager";
  }

  // Number cards must be strictly ascending
  return card.value > last.value;
}

export function getLegalPlays(hand: Card[], expeditions: Expeditions): PlayAction[] {
  const actions: PlayAction[] = [];

  for (const card of hand) {
    if (canPlayToExpedition(card, expeditions[card.color])) {
      actions.push({ kind: "expedition", card });
    }
    // Discarding is always legal for every card
    actions.push({ kind: "discard", card });
  }

  return actions;
}

export function getLegalDraws(
  discardPiles: DiscardPiles,
  drawPile: Card[],
  lastDiscardedColor: ExpeditionColor | null,
): DrawAction[] {
  const actions: DrawAction[] = [];

  if (drawPile.length > 0) {
    actions.push({ kind: "draw-pile" });
  }

  for (const color of EXPEDITION_COLORS) {
    if (discardPiles[color].length > 0 && color !== lastDiscardedColor) {
      actions.push({ kind: "discard-pile", color });
    }
  }

  return actions;
}
