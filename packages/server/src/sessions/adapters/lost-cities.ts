import { ALL_STRATEGIES, getStrategy } from "@boardgames/core/games/lost-cities/ai-strategies";
import {
  applyDraw,
  applyPlay,
  createInitialState,
} from "@boardgames/core/games/lost-cities/game-engine";
import type {
  LostCitiesPlayerView,
  LostCitiesResult,
} from "@boardgames/core/games/lost-cities/machine";
import { runISMCTSWithStats } from "@boardgames/core/games/lost-cities/mcts/ismcts";
import { getLegalDraws, getLegalPlays } from "@boardgames/core/games/lost-cities/rules";
import { scoreGame } from "@boardgames/core/games/lost-cities/scoring";
import type {
  ActionLogEntry,
  AIEngine,
  Card,
  DrawAction,
  ExpeditionColor,
  GameState,
  PlayAction,
  PlayerIndex,
} from "@boardgames/core/games/lost-cities/types";
import { registerAdapter } from "../adapter-registry.ts";
import type { GameSessionAdapter } from "../types.ts";

interface LostCitiesConfig {
  aiEngine: AIEngine;
}

interface LostCitiesSessionState {
  game: GameState;
  pendingAiDraw: DrawAction | null;
  aiEngine: AIEngine;
  actionLog: ActionLogEntry[];
}

type LostCitiesAction =
  | { phase: "play"; action: PlayAction }
  | { phase: "draw"; action: DrawAction };

const adapter: GameSessionAdapter<
  LostCitiesSessionState,
  LostCitiesAction,
  LostCitiesConfig,
  LostCitiesPlayerView,
  LostCitiesAction,
  LostCitiesResult
> = {
  createInitialState(config) {
    return {
      game: createInitialState(),
      pendingAiDraw: null,
      aiEngine: config.aiEngine,
      actionLog: [],
    };
  },

  getActivePlayer(state) {
    return state.game.currentPlayer;
  },

  getLegalActions(state, player) {
    if (player !== 0) return [];
    if (state.game.currentPlayer !== 0) return [];

    if (state.game.turnPhase === "play") {
      return getLegalPlays(state.game.hands[0], state.game.expeditions[0]).map((a) => ({
        phase: "play" as const,
        action: a,
      }));
    }

    return getLegalDraws(
      state.game.discardPiles,
      state.game.drawPile,
      state.game.lastDiscardedColor,
    ).map((a) => ({
      phase: "draw" as const,
      action: a,
    }));
  },

  applyAction(state, action) {
    const gs = state.game;
    const player = gs.currentPlayer;

    if (action.phase === "play") {
      const play = action.action;
      const entry: ActionLogEntry = {
        turn: gs.turnCount,
        player,
        action: play.kind === "expedition" ? "play-expedition" : "play-discard",
        card: play.card,
      };
      return {
        ...state,
        game: applyPlay(gs, play),
        actionLog: [...state.actionLog, entry],
      };
    }

    const draw = action.action;
    const isDrawPile = draw.kind === "draw-pile";
    const hiddenCard: Card = {
      id: -1,
      color: "yellow" as ExpeditionColor,
      type: "number",
      value: 0,
    };
    const card = isDrawPile
      ? player === 0
        ? gs.drawPile[gs.drawPile.length - 1]
        : hiddenCard
      : gs.discardPiles[draw.color][gs.discardPiles[draw.color].length - 1];
    const entry: ActionLogEntry = {
      turn: gs.turnCount,
      player,
      action: isDrawPile ? "draw-pile" : "draw-discard",
      card,
      color: !isDrawPile ? draw.color : undefined,
    };
    return {
      ...state,
      game: applyDraw(gs, draw),
      actionLog: [...state.actionLog, entry],
    };
  },

  isGameOver(state) {
    return state.game.phase === "game-over";
  },

  getResult(state) {
    const scores = scoreGame(state.game);
    const diff = scores[0].total - scores[1].total;
    return {
      scores,
      winner: diff > 0 ? (0 as PlayerIndex) : diff < 0 ? (1 as PlayerIndex) : "draw",
    };
  },

  getPlayerView(state, _player) {
    const scores = scoreGame(state.game);
    return {
      playerHand: state.game.hands[0],
      playerExpeditions: state.game.expeditions[0],
      opponentExpeditions: state.game.expeditions[1],
      discardPiles: state.game.discardPiles,
      drawPileCount: state.game.drawPile.length,
      opponentHandCount: state.game.hands[1].length,
      currentPlayer: state.game.currentPlayer,
      turnPhase: state.game.turnPhase,
      phase: state.game.phase,
      turnCount: state.game.turnCount,
      playerScore: scores[0],
      opponentScore: scores[1],
      lastDiscardedColor: state.game.lastDiscardedColor,
      actionLog: state.actionLog,
    };
  },

  computeAiMove(state, _player) {
    if (state.game.turnPhase === "draw" && state.pendingAiDraw) {
      const draw = state.pendingAiDraw;
      state.pendingAiDraw = null;
      return { phase: "draw", action: draw } as LostCitiesAction;
    }

    const strategy = getStrategy(state.aiEngine) ?? ALL_STRATEGIES[0];
    const { move } = runISMCTSWithStats(state.game, 1, strategy);

    state.pendingAiDraw = move.draw;
    return { phase: "play", action: move.play } as LostCitiesAction;
  },
};

registerAdapter("lost-cities", adapter as GameSessionAdapter);
