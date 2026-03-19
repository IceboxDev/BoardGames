import { applyAction } from "@boardgames/core/games/pandemic/game-engine";
import { getLegalActions } from "@boardgames/core/games/pandemic/rules";
import { createGame } from "@boardgames/core/games/pandemic/setup";
import type { GameAction, GameResult, GameState } from "@boardgames/core/games/pandemic/types";
import { registerAdapter } from "../adapter-registry.ts";
import type { GameSessionAdapter } from "../types.ts";

interface PandemicConfig {
  numPlayers: 2 | 3 | 4;
  difficulty: 4 | 5 | 6;
}

const adapter: GameSessionAdapter<
  GameState,
  GameAction,
  PandemicConfig,
  GameState,
  GameAction,
  GameResult | null
> = {
  createInitialState(config) {
    return createGame(config);
  },

  getActivePlayer(state) {
    return state.currentPlayerIndex;
  },

  getLegalActions(state, _player) {
    return getLegalActions(state);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  isGameOver(state) {
    return state.result !== null;
  },

  getResult(state) {
    return state.result;
  },

  getPlayerView(state, _player) {
    return state;
  },
};

registerAdapter("pandemic", adapter as GameSessionAdapter);
