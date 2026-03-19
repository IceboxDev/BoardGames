import { assign, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import {
  advanceTurn,
  applyAction,
  applyDrawPhase,
  applyInfectPhase,
  resolveEpidemic,
} from "./game-engine";
import { getLegalActions } from "./rules";
import { createGame } from "./setup";
import type { GameAction, GameResult, GameState, SetupConfig } from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface PandemicContext {
  gameState: GameState;
}

export type PandemicEvent =
  | { type: "START"; config: SetupConfig }
  | { type: "PLAYER_ACTION"; action: GameAction }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const pandemicMachine = setup({
  types: {} as {
    context: PandemicContext;
    events: PandemicEvent;
  },

  delays: {
    automatedDelay: 300,
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.result !== null,
    isActionsPhase: ({ context }) => context.gameState.phase === "actions",
    isDrawPhase: ({ context }) => context.gameState.phase === "draw",
    isEpidemicPhase: ({ context }) => context.gameState.phase === "epidemic",
    isInfectPhase: ({ context }) => context.gameState.phase === "infect",
    isDiscardPhase: ({ context }) => context.gameState.phase === "discard",
    isForecastPhase: ({ context }) => context.gameState.phase === "forecast",
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return { gameState: createGame(event.config) };
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return { gameState: applyAction(context.gameState, event.action) };
    }),

    runDrawPhase: assign(({ context }) => ({
      gameState: applyDrawPhase(context.gameState),
    })),

    runEpidemic: assign(({ context }) => ({
      gameState: resolveEpidemic(context.gameState),
    })),

    runInfectPhase: assign(({ context }) => ({
      gameState: applyInfectPhase(context.gameState),
    })),

    runAdvanceTurn: assign(({ context }) => ({
      gameState: advanceTurn(context.gameState),
    })),
  },
}).createMachine({
  id: "pandemic",
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
            { guard: "isGameOver", target: "#pandemic.gameOver" },
            { guard: "isActionsPhase", target: "actions" },
            { guard: "isDrawPhase", target: "draw" },
            { guard: "isEpidemicPhase", target: "epidemic" },
            { guard: "isInfectPhase", target: "infect" },
            { guard: "isDiscardPhase", target: "discard" },
            { guard: "isForecastPhase", target: "forecast" },
          ],
        },

        actions: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        draw: {
          entry: "runDrawPhase",
          after: {
            automatedDelay: { target: "routing" },
          },
        },

        epidemic: {
          entry: "runEpidemic",
          after: {
            automatedDelay: { target: "routing" },
          },
        },

        infect: {
          entry: "runInfectPhase",
          after: {
            automatedDelay: { target: "routing" },
          },
        },

        discard: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        forecast: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },
      },

      on: {
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

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const pandemicSpec: GameMachineSpec<
  typeof pandemicMachine,
  GameState,
  GameAction,
  GameResult | null
> = {
  machine: pandemicMachine,

  getPlayerView(snapshot, _player) {
    return snapshot.context.gameState;
  },

  getLegalActions(snapshot, _player) {
    return getLegalActions(snapshot.context.gameState);
  },

  getActivePlayer(snapshot) {
    return snapshot.context.gameState.currentPlayerIndex;
  },

  getResult(snapshot) {
    return snapshot.context.gameState.result;
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },
};
