import { getStrategy } from "@boardgames/core/games/durak/ai-strategies";
import { applyActionPure, createInitialState } from "@boardgames/core/games/durak/game-engine";
import { getActivePlayer, getLegalActions } from "@boardgames/core/games/durak/rules";
import type {
  Action,
  AIStrategyId,
  DurakPlayerView,
  DurakResult,
  GameState,
} from "@boardgames/core/games/durak/types";
import { registerAdapter } from "../adapter-registry.ts";
import type { GameSessionAdapter } from "../types.ts";

interface DurakConfig {
  playerCount: number;
  strategies: (AIStrategyId | null)[];
}

const adapter: GameSessionAdapter<
  GameState,
  Action,
  DurakConfig,
  DurakPlayerView,
  Action,
  DurakResult
> = {
  createInitialState(config) {
    return createInitialState(config.playerCount, config.strategies);
  },

  getActivePlayer(state) {
    return getActivePlayer(state);
  },

  getLegalActions(state, player) {
    const active = getActivePlayer(state);
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
    return {
      durak: state.durak,
      isDraw: state.durak === null,
      turnCount: state.turnCount,
    };
  },

  getPlayerView(state, player): DurakPlayerView {
    return {
      phase: state.phase,
      hand: state.players[player]?.hand ?? [],
      trumpCard: state.trumpCard,
      trumpSuit: state.trumpSuit,
      table: state.table,
      drawPileCount: state.drawPile.length,
      discardPileCount: state.discardPile.length,
      topDiscardCard:
        state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null,
      players: state.players.map((p) => ({
        index: p.index,
        type: p.type,
        handCount: p.hand.length,
        isOut: p.isOut,
        aiStrategy: p.aiStrategy,
      })),
      attackerIndex: state.attackerIndex,
      defenderIndex: state.defenderIndex,
      turnCount: state.turnCount,
      durak: state.durak,
      actionLog: state.actionLog,
    };
  },

  computeAiMove(state, player) {
    const playerState = state.players[player];
    if (!playerState) throw new Error(`Invalid player index: ${player}`);

    const strategyId = playerState.aiStrategy ?? "random";
    const strategy = getStrategy(strategyId);
    const legal = getLegalActions(state);

    if (legal.length === 0) throw new Error("No legal actions for AI");

    return strategy.pickAction(state, legal, player);
  },
};

registerAdapter("durak", adapter as GameSessionAdapter);
