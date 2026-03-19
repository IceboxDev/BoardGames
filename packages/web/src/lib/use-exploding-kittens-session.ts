import type {
  Action,
  AIStrategyId,
  Card,
  GamePhase,
  GameState,
} from "@boardgames/core/games/exploding-kittens/types";
import { useGameSession } from "./ws-client";

export interface EKPlayerView {
  phase: GamePhase;
  hand: Card[];
  drawPileCount: number;
  discardPile: Card[];
  players: {
    index: number;
    type: "human" | "ai";
    handCount: number;
    alive: boolean;
    aiStrategy?: AIStrategyId;
  }[];
  currentPlayerIndex: number;
  turnsRemaining: number;
  turnCount: number;
  nopeWindow: GameState["nopeWindow"];
  favorContext: GameState["favorContext"];
  stealContext: GameState["stealContext"];
  discardPickContext: GameState["discardPickContext"];
  peekContext: GameState["peekContext"] | null;
  explosionContext: GameState["explosionContext"];
  actionLog: GameState["actionLog"];
  winner: number | null;
}

export interface EKResult {
  winner: number;
  winnerIsHuman: boolean;
  turnCount: number;
}

export function useExplodingKittensSession() {
  const session = useGameSession<EKPlayerView, Action, EKResult>();

  return {
    ...session,
    startGame(playerCount: number, strategies: (AIStrategyId | null)[]) {
      session.createSession("exploding-kittens", { playerCount, strategies });
    },
    performAction(action: Action) {
      session.sendAction(action);
    },
  };
}
