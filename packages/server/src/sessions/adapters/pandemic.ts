import { applyAction } from "@boardgames/core/games/pandemic/game-engine";
import { getPublicView } from "@boardgames/core/games/pandemic/player-view";
import { createRng, randomSeed } from "@boardgames/core/games/pandemic/rng";
import { getLegalActions } from "@boardgames/core/games/pandemic/rules";
import { createGame } from "@boardgames/core/games/pandemic/setup";
import type {
  GameAction,
  GameResult,
  GameState,
  LegalAction,
} from "@boardgames/core/games/pandemic/types";
import { registerAdapter } from "../adapter-registry.ts";
import type { GameSessionAdapter } from "../types.ts";

interface PandemicConfig {
  numPlayers: 2 | 3 | 4;
  difficulty: 4 | 5 | 6;
  seed?: number;
}

const adapter: GameSessionAdapter<
  GameState,
  GameAction,
  PandemicConfig,
  GameState,
  LegalAction,
  GameResult | null
> = {
  createInitialState(config) {
    const seed = config.seed ?? randomSeed();
    return createGame({ ...config, seed }, createRng(seed));
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

  getPlayerView(state, player) {
    return getPublicView(state, player);
  },
};

registerAdapter("pandemic", adapter as GameSessionAdapter);
