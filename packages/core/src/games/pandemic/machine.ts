import { assign, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import {
  advanceTurn,
  applyAction,
  applyDrawPhase,
  applyInfectPhase,
  InvalidActionError,
  resolveEpidemic,
} from "./game-engine";
import { getPublicView } from "./player-view";
import {
  buildGameLog,
  makeAutomatedStep,
  makeInitialStep,
  makePlayerActionStep,
  type PandemicGameReplayLog,
  type PandemicReplayStep,
} from "./replay-log";
import type { Rng } from "./rng";
import { createRng, randomSeed } from "./rng";
import { canPlayEvent, getLegalActions } from "./rules";
import { createGame } from "./setup";
import type { GameAction, GameResult, GameState, LegalAction, SetupConfig } from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

/**
 * gameState is null while the machine sits in the `idle` state (before START).
 * All guards and transitions that depend on gameState must null-check.
 *
 * `seed` is the deterministic PRNG seed for this game. `rng` is the live
 * PRNG closure — it's NOT serializable across persistence boundaries, but
 * XState snapshots of in-memory actors preserve it fine. For replay
 * reconstruction, the seed alone is sufficient to re-derive the rng.
 */
export interface PandemicContext {
  gameState: GameState | null;
  seed: number;
  rng: Rng;
  replaySteps: PandemicReplayStep[];
}

export type PandemicEvent =
  | { type: "START"; config: SetupConfig }
  | { type: "PLAYER_ACTION"; action: GameAction }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

// Placeholder rng for the initial idle-state context. Never called — every
// phase that could invoke rng guards on gameState being non-null.
const PLACEHOLDER_RNG: Rng = () => 0;

export const pandemicMachine = setup({
  types: {} as {
    context: PandemicContext;
    events: PandemicEvent;
  },

  delays: {
    automatedDelay: 300,
  },

  guards: {
    isGameOver: ({ context }) => context.gameState?.result != null,
    isActionsPhase: ({ context }) => context.gameState?.phase === "actions",
    isDrawPhase: ({ context }) => context.gameState?.phase === "draw",
    isEpidemicPhase: ({ context }) => context.gameState?.phase === "epidemic",
    isInfectPhase: ({ context }) => context.gameState?.phase === "infect",
    isDiscardPhase: ({ context }) => context.gameState?.phase === "discard",
    isForecastPhase: ({ context }) => context.gameState?.phase === "forecast",
    isEventPlayable: ({ context, event }) => {
      if (context.gameState === null) return false;
      if (event.type !== "PLAYER_ACTION") return false;
      if (event.action.kind !== "play_event") return false;
      return canPlayEvent(context.gameState);
    },
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      const seed = event.config.seed ?? randomSeed();
      const rng = createRng(seed);
      const gs = createGame(event.config, rng);
      return {
        gameState: gs,
        seed,
        rng,
        replaySteps: [makeInitialStep(gs)],
      };
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      if (context.gameState === null) return {};
      const preState = context.gameState;
      try {
        const postState = applyAction(preState, event.action);
        return {
          gameState: postState,
          replaySteps: [
            ...context.replaySteps,
            makePlayerActionStep(context.replaySteps, event.action, preState, postState),
          ],
        };
      } catch (err) {
        // The UI is expected to only dispatch actions derived from
        // getLegalActions; hitting this path means the UI and engine
        // disagree about legality. Log loudly and keep the old state so
        // the user can retry with a legal move.
        if (err instanceof InvalidActionError) {
          console.error(err.message, err.action);
          return {};
        }
        throw err;
      }
    }),

    runDrawPhase: assign(({ context }) => {
      if (context.gameState === null) return {};
      const preState = context.gameState;
      const postState = applyDrawPhase(preState);
      return {
        gameState: postState,
        replaySteps: [
          ...context.replaySteps,
          makeAutomatedStep(context.replaySteps, "draw", preState, postState),
        ],
      };
    }),

    runEpidemic: assign(({ context }) => {
      if (context.gameState === null) return {};
      const preState = context.gameState;
      const postState = resolveEpidemic(preState, context.rng);
      return {
        gameState: postState,
        replaySteps: [
          ...context.replaySteps,
          makeAutomatedStep(context.replaySteps, "epidemic", preState, postState),
        ],
      };
    }),

    runInfectPhase: assign(({ context }) => {
      if (context.gameState === null) return {};
      const preState = context.gameState;
      const postState = applyInfectPhase(preState);
      return {
        gameState: postState,
        replaySteps: [
          ...context.replaySteps,
          makeAutomatedStep(context.replaySteps, "infect", preState, postState),
        ],
      };
    }),

    runAdvanceTurn: assign(({ context }) => {
      if (context.gameState === null) return {};
      const preState = context.gameState;
      const postState = advanceTurn(preState);
      return {
        gameState: postState,
        replaySteps: [
          ...context.replaySteps,
          makeAutomatedStep(context.replaySteps, "advance_turn", preState, postState),
        ],
      };
    }),
  },
}).createMachine({
  id: "pandemic",
  initial: "idle",
  context: {
    gameState: null,
    seed: 0,
    rng: PLACEHOLDER_RNG,
    replaySteps: [],
  },

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
        // Parent-level PLAYER_ACTION handler for event card plays.
        // Child states that don't handle PLAYER_ACTION (draw, epidemic, infect)
        // bubble the event up here. This is an INTERNAL transition (no target)
        // so the child state isn't exited or re-entered — which is critical
        // because draw/epidemic/infect have `entry` actions that would
        // otherwise re-run and cause another draw/epidemic/infect step.
        //
        // The isEventPlayable guard ensures only play_event actions are
        // accepted at the parent level; the validator in game-engine is the
        // authoritative enforcer of legality.
        PLAYER_ACTION: {
          guard: "isEventPlayable",
          actions: "applyPlayerAction",
        },
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
  LegalAction,
  GameResult | null
> = {
  machine: pandemicMachine,

  getPlayerView(snapshot, player) {
    const gs = snapshot.context.gameState;
    if (gs === null) {
      throw new Error("pandemicSpec.getPlayerView called before game started");
    }
    return getPublicView(gs, player);
  },

  getLegalActions(snapshot, _player) {
    const gs = snapshot.context.gameState;
    if (gs === null) return [];
    return getLegalActions(gs);
  },

  getActivePlayer(snapshot) {
    return snapshot.context.gameState?.currentPlayerIndex ?? 0;
  },

  getResult(snapshot) {
    return snapshot.context.gameState?.result ?? null;
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getReplayLog(snapshot): PandemicGameReplayLog | null {
    const ctx = snapshot.context;
    if (ctx.gameState === null) return null;
    if (ctx.gameState.result === null) return null;
    return buildGameLog({
      seed: ctx.seed,
      config: {
        numPlayers: ctx.gameState.players.length as 2 | 3 | 4,
        difficulty: ctx.gameState.difficulty,
        seed: ctx.seed,
      },
      steps: ctx.replaySteps,
      finalState: ctx.gameState,
    });
  },
};
