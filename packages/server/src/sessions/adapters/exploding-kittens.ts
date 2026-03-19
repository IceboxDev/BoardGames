import { getStrategy } from "@boardgames/core/games/exploding-kittens/ai-strategies";
import {
  applyActionPure,
  createInitialState,
} from "@boardgames/core/games/exploding-kittens/game-engine";
import { runISMCTS } from "@boardgames/core/games/exploding-kittens/mcts/ismcts";
import { getActiveDecider, getLegalActions } from "@boardgames/core/games/exploding-kittens/rules";
import type {
  Action,
  ActionLogEntry,
  AIStrategyId,
  Card,
  GamePhase,
  GameState,
} from "@boardgames/core/games/exploding-kittens/types";
import { registerAdapter } from "../adapter-registry.ts";
import type { GameSessionAdapter } from "../types.ts";

interface EKConfig {
  playerCount: number;
  strategies: (AIStrategyId | null)[];
}

interface EKPlayerView {
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
  actionLog: ActionLogEntry[];
  winner: number | null;
}

interface EKResult {
  winner: number;
  winnerIsHuman: boolean;
  turnCount: number;
}

const adapter: GameSessionAdapter<GameState, Action, EKConfig, EKPlayerView, Action, EKResult> = {
  createInitialState(config) {
    return createInitialState(config.playerCount, config.strategies);
  },

  getActivePlayer(state) {
    return getActiveDecider(state);
  },

  getLegalActions(state, player) {
    const active = getActiveDecider(state);
    if (active !== player) return [];
    return getLegalActions(state);
  },

  applyAction(state, action) {
    return applyActionPure(state, action);
  },

  isGameOver(state) {
    return state.phase === "game-over";
  },

  getResult(state) {
    const winner = state.winner ?? 0;
    return {
      winner,
      winnerIsHuman: state.players[winner]?.type === "human",
      turnCount: state.turnCount,
    };
  },

  getPlayerView(state, player) {
    const isActive = getActiveDecider(state) === player;
    return {
      phase: state.phase,
      hand: state.players[player]?.hand ?? [],
      drawPileCount: state.drawPile.length,
      discardPile: state.discardPile,
      players: state.players.map((p) => ({
        index: p.index,
        type: p.type,
        handCount: p.hand.length,
        alive: p.alive,
        aiStrategy: p.aiStrategy,
      })),
      currentPlayerIndex: state.currentPlayerIndex,
      turnsRemaining: state.turnsRemaining,
      turnCount: state.turnCount,
      nopeWindow: state.nopeWindow,
      favorContext: state.favorContext,
      stealContext: state.stealContext,
      discardPickContext: state.discardPickContext,
      peekContext: isActive ? state.peekContext : null,
      explosionContext: state.explosionContext,
      actionLog: state.actionLog ?? [],
      winner: state.winner,
    };
  },

  computeAiMove(state, player) {
    const playerState = state.players[player];
    if (!playerState) throw new Error(`Invalid player index: ${player}`);

    const strategyId = playerState.aiStrategy ?? "heuristic-v1";
    const strategy = getStrategy(strategyId);
    const legal = getLegalActions(state);

    if (legal.length === 0) throw new Error("No legal actions for AI");

    if (strategy.mctsConfig) {
      return runISMCTS(state, player, strategy.mctsConfig);
    }

    return strategy.pickAction(state, legal, player);
  },
};

registerAdapter("exploding-kittens", adapter as GameSessionAdapter);
