import type { GameState, Selection } from "../types";
import { createMinimaxStrategy } from "./minimax";
import { createNashStrategy } from "./nash";

export type StrategyFn = (gs: GameState, aiIndex: number) => Selection;

export type StrategyId = "minimax" | "nash" | "random";

const randomStrategy: StrategyFn = (gs, aiIndex) => {
  const hand = gs.players[aiIndex].hand;
  const idx = Math.floor(Math.random() * hand.length);
  return { cardId: hand[idx].id };
};

export function createStrategy(id: StrategyId): StrategyFn {
  switch (id) {
    case "minimax":
      return createMinimaxStrategy();
    case "nash":
      return createNashStrategy();
    case "random":
      return randomStrategy;
  }
}

export interface StrategyMeta {
  id: StrategyId;
  label: string;
  description: string;
}

export const ALL_STRATEGIES: StrategyMeta[] = [
  {
    id: "nash",
    label: "Nash Equilibrium",
    description:
      "Game-theoretically optimal. Solves each turn as a simultaneous-move zero-sum game.",
  },
  {
    id: "minimax",
    label: "Minimax",
    description: "Classic sequential search with alpha-beta pruning. Strong but exploitable.",
  },
  { id: "random", label: "Random", description: "Picks a random card each turn." },
];
