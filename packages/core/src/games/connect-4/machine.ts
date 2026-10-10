import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import { strategyGuard, typedSeatStrategies } from "../../machines/seats";
import type { GameMachineSpec } from "../../machines/types";
import { type AiOffload, getStrategy, HEAVY_STRATEGIES, pickAiAction } from "./ai-strategies";
import { type Connect4Config, connect4Manifest } from "./manifest";
import { connect4Outcome } from "./outcome";
import { buildReplayLog } from "./replay-log";
import { applyActionPure, createInitialState, getLegalActions, isAi } from "./rules";
import {
  type Action,
  AI_STRATEGY_LABELS,
  type AIStrategyId,
  type Connect4PlayerView,
  type Connect4Result,
  type GameState,
} from "./types";
import { buildPlayerView } from "./view";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface Connect4Context {
  gameState: GameState;
}

export type Connect4Event =
  | {
      type: "START";
      strategies: (AIStrategyId | null)[];
      config: Connect4Config;
      seed: number;
    }
  | { type: "PLAYER_ACTION"; action: Action; player: number }
  | { type: "RESET" };

/** How long a finished game of a series stays on screen before the next one starts by itself. */
export const BETWEEN_GAMES_MS = 8_000;

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

function isAiTurn(gs: GameState): boolean {
  return gs.phase === "playing" && isAi(gs, gs.currentPlayer);
}

function decideInline(state: GameState): Action {
  const legal = getLegalActions(state, state.currentPlayer);
  if (legal.length === 0) throw new Error("No legal actions for the AI");
  return pickAiAction(state, legal);
}

/**
 * The AI actor. With an offload (the server's worker pool) the heavy
 * strategies think there; if that fails, Lookahead decides inline.
 */
function aiActors(offload: AiOffload | null) {
  return {
    computeAiMove: fromPromise(async ({ input }: { input: { state: GameState } }) => {
      const { state } = input;
      const id = state.strategies[state.currentPlayer];
      if (offload && id && HEAVY_STRATEGIES.has(id)) {
        try {
          return await offload(state);
        } catch {
          const legal = getLegalActions(state, state.currentPlayer);
          return getStrategy("lookahead").pickAction(state, legal, state.currentPlayer);
        }
      }
      return decideInline(state);
    }),
  };
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const connect4Machine = setup({
  types: {} as {
    context: Connect4Context;
    events: Connect4Event;
  },

  delays: {
    aiDelay: 400,
    betweenGames: BETWEEN_GAMES_MS,
  },

  actors: aiActors(null),

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    isBetweenGames: ({ context }) => context.gameState.phase === "between-games",
    isAiTurn: ({ context }) => isAiTurn(context.gameState),
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("connect-4", () => ({
        gameState: createInitialState(event.strategies, event.config, event.seed),
      }));
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return safeApply("connect-4", () => ({
        gameState: applyActionPure(context.gameState, event.action, event.player),
      }));
    }),

    applyAiAction: assign(({ context, event }) => {
      const action = (event as unknown as { output: Action }).output;
      const gs = context.gameState;
      return safeApply("connect-4", () => ({
        gameState: applyActionPure(gs, action, gs.currentPlayer),
      }));
    }),

    autoContinue: assign(({ context }) => {
      const gs = context.gameState;
      const person = gs.strategies.indexOf(null);
      return safeApply("connect-4", () => ({
        gameState: applyActionPure(gs, { type: "continue" }, person),
      }));
    }),
  },
}).createMachine({
  id: "connect4",
  initial: "idle",
  context: { gameState: PLACEHOLDER },

  states: {
    idle: {
      on: {
        START: { target: "active", actions: "initGame" },
      },
    },

    active: {
      initial: "routing",

      states: {
        routing: {
          always: [
            { guard: "isGameOver", target: "#connect4.gameOver" },
            { guard: "isBetweenGames", target: "betweenGames" },
            { guard: "isAiTurn", target: "aiComputing" },
            { target: "awaitingHuman" },
          ],
        },

        awaitingHuman: {},

        aiComputing: {
          invoke: {
            id: "computeAiMove",
            src: "computeAiMove",
            input: ({ context }) => ({ state: context.gameState }),
            onDone: { target: "aiDelay", actions: "applyAiAction" },
            // Back off before retrying — straight to `routing` would re-invoke
            // a failing AI in a tight loop.
            onError: { target: "aiDelay" },
          },
        },

        aiDelay: {
          after: { aiDelay: "routing" },
        },

        betweenGames: {
          // Nobody can stall a series: the next game starts by itself.
          after: { betweenGames: { target: "routing", actions: "autoContinue" } },
        },
      },

      on: {
        // A person may act in any sub-state: their move, a resignation on the
        // AI's turn (abandoning its search), or starting the next game.
        PLAYER_ACTION: { target: ".routing", actions: "applyPlayerAction" },
        START: { target: "active", actions: "initGame" },
        RESET: { target: "idle" },
      },
    },

    gameOver: {
      on: {
        START: { target: "active", actions: "initGame" },
        RESET: { target: "idle" },
      },
    },
  },
});

/** The machine with heavy AI decisions sent to `offload` (the server's worker pool). */
export function withConnect4AiOffload(offload: AiOffload): typeof connect4Machine {
  return connect4Machine.provide({ actors: aiActors(offload) });
}

// ---------------------------------------------------------------------------
// Views & legal actions
// ---------------------------------------------------------------------------

function legalActionsFor(snapshot: SnapshotFrom<typeof connect4Machine>, player: number): Action[] {
  const gs = snapshot.context.gameState;
  // Context holds a placeholder until START, so a pre-game snapshot has no state.
  if (!gs) return [];
  return getLegalActions(gs, player);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const toStrategy = strategyGuard("Connect 4", AI_STRATEGY_LABELS);

export const connect4Spec: GameMachineSpec<
  typeof connect4Machine,
  Connect4PlayerView,
  Action,
  Connect4Result,
  Connect4Config
> = {
  machine: connect4Machine,
  manifest: connect4Manifest,

  buildStart: ({ seats, config, seed }) => ({
    type: "START",
    strategies: typedSeatStrategies(seats, toStrategy),
    config,
    seed,
  }),

  getPlayerView(snapshot) {
    return buildPlayerView(snapshot.context.gameState);
  },

  getLegalActions(snapshot, player) {
    return legalActionsFor(snapshot, player);
  },

  validateAction: playerActionValidator({
    legalActions: legalActionsFor,
    toEvent: (action, player) => ({ type: "PLAYER_ACTION", action, player }) as const,
  }),

  getActivePlayer(snapshot) {
    return snapshot.context.gameState?.currentPlayer ?? 0;
  },

  // Resigning and starting the next game are open to either person;
  // `validateAction` still checks each against the engine's list.
  acceptsOffTurn(snapshot, player) {
    return legalActionsFor(snapshot, player).length > 0;
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    if (gs?.phase !== "game-over") return null;
    return { seriesWinner: gs.seriesWinner, wins: gs.wins, gamesPlayed: gs.games.length };
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getOutcome(snapshot) {
    const gs = snapshot.context.gameState;
    return gs?.phase === "game-over" ? connect4Outcome(gs) : null;
  },

  getReplayLog(snapshot) {
    const gs = snapshot.context.gameState;
    return gs?.phase === "game-over" ? buildReplayLog(gs) : null;
  },
};
