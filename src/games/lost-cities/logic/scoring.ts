import type {
  Card,
  ExpeditionColor,
  ExpeditionScore,
  Expeditions,
  GameState,
  PlayerScore,
} from "./types";
import { EXPEDITION_COLORS } from "./types";

export function scoreExpedition(color: ExpeditionColor, cards: Card[]): ExpeditionScore {
  if (cards.length === 0) {
    return {
      color,
      cardValues: 0,
      expeditionCost: 0,
      wagerMultiplier: 1,
      subtotal: 0,
      lengthBonus: 0,
      total: 0,
      cardCount: 0,
      started: false,
    };
  }

  const wagerCount = cards.filter((c) => c.type === "wager").length;
  const cardValues = cards.reduce((sum, c) => sum + (c.type === "number" ? c.value : 0), 0);
  const expeditionCost = 20;
  const wagerMultiplier = 1 + wagerCount;
  const subtotal = (cardValues - expeditionCost) * wagerMultiplier;
  const lengthBonus = cards.length >= 8 ? 20 : 0;

  return {
    color,
    cardValues,
    expeditionCost,
    wagerMultiplier,
    subtotal,
    lengthBonus,
    total: subtotal + lengthBonus,
    cardCount: cards.length,
    started: true,
  };
}

export function scorePlayer(expeditions: Expeditions): PlayerScore {
  const scored = EXPEDITION_COLORS.map((color) => scoreExpedition(color, expeditions[color]));
  return {
    expeditions: scored,
    total: scored.reduce((sum, e) => sum + e.total, 0),
  };
}

export function scoreGame(state: GameState): {
  player: PlayerScore;
  ai: PlayerScore;
} {
  return {
    player: scorePlayer(state.playerExpeditions),
    ai: scorePlayer(state.aiExpeditions),
  };
}
