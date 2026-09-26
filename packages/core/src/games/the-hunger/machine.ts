import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { randomSeed } from "../../lib/rng";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import type { GameMachineSpec } from "../../machines/types";
import { pickAiAction } from "./ai-strategies";
import { applyActionPure, createInitialState } from "./game-engine";
import { buildPlayerView } from "./player-view";
import { getActivePlayer, getLegalActions } from "./rules";
import type {
  Action,
  AIStrategyId,
  GameOptions,
  GameState,
  HungerPlayerView,
  HungerResult,
} from "./types";
import { isUndoable } from "./undo";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

/** Pacing (ms). Tests START with `{ ai: 1 }` under fake timers. */
export interface HungerBeats {
  /** Pause before an AI seat acts, so humans can follow the board. */
  ai: number;
}

export const DEFAULT_BEATS: HungerBeats = { ai: 450 };

export interface HungerContext {
  gameState: GameState;
  beats: HungerBeats;
  /**
   * States before each undoable action the deciding player took this turn,
   * newest last. Cleared by anything that reveals, involves luck, or passes
   * the decision on (see undo.ts).
   */
  undo: { player: number; states: GameState[] } | null;
}

const UNDO_DEPTH = 50;

export type HungerEvent =
  | {
      type: "START";
      playerCount: number;
      strategies: (AIStrategyId | null)[];
      options?: Partial<GameOptions>;
      seed?: number;
      beats?: Partial<HungerBeats>;
    }
  | { type: "PLAYER_ACTION"; action: Action }
  | { type: "RESET" };

const PLACEHOLDER = null as unknown as GameState;

function isAiTurn(gs: GameState | null): boolean {
  if (!gs || gs.phase === "game-over") return false;
  const active = getActivePlayer(gs);
  return gs.players[active]?.type === "ai";
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const theHungerMachine = setup({
  types: {} as {
    context: HungerContext;
    events: HungerEvent;
  },

  delays: {
    aiDelay: ({ context }) => context.beats.ai,
  },

  actors: {
    computeAiMove: fromPromise(async ({ input }: { input: { state: GameState } }) => {
      // Yield so the session manager flushes the previous state first.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { seat: getActivePlayer(input.state), action: pickAiAction(input.state) };
    }),
  },

  guards: {
    noGame: ({ context }) => !context.gameState,
    isGameOver: ({ context }) => context.gameState?.phase === "game-over",
    isAiTurn: ({ context }) => isAiTurn(context.gameState),
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("the-hunger", () => ({
        gameState: createInitialState({
          playerCount: event.playerCount,
          strategies: event.strategies,
          seed: event.seed ?? randomSeed(),
          options: event.options,
        }),
        beats: { ...DEFAULT_BEATS, ...event.beats },
        undo: null,
      }));
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return safeApply("the-hunger", () => {
        // The validator only admits the active seat's actions (and its own undo).
        const player = getActivePlayer(context.gameState);
        if (event.action.type === "undo") {
          const states = context.undo?.states ?? [];
          const previous = states[states.length - 1];
          if (!previous || context.undo?.player !== player) return {};
          const rest = states.slice(0, -1);
          return { gameState: previous, undo: rest.length > 0 ? { player, states: rest } : null };
        }
        const before = context.gameState;
        const gameState = applyActionPure(before, player, event.action);
        const kept = context.undo?.player === player ? context.undo.states : [];
        return {
          gameState,
          undo: isUndoable(before, gameState, event.action)
            ? { player, states: [...kept, before].slice(-UNDO_DEPTH) }
            : null,
        };
      });
    }),
  },
}).createMachine({
  id: "the-hunger",
  initial: "idle",
  context: { gameState: PLACEHOLDER, beats: DEFAULT_BEATS, undo: null },

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
            { guard: "noGame", target: "#the-hunger.idle" },
            { guard: "isGameOver", target: "#the-hunger.gameOver" },
            { guard: "isAiTurn", target: "aiThinking" },
            { target: "awaitingPlayer" },
          ],
        },

        awaitingPlayer: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },

        aiThinking: {
          after: { aiDelay: "aiActing" },
        },

        aiActing: {
          invoke: {
            id: "computeAiMove",
            src: "computeAiMove",
            input: ({ context }) => ({ state: context.gameState }),
            onDone: {
              target: "routing",
              actions: assign(({ context, event }) =>
                safeApply("the-hunger", () => ({
                  gameState: applyActionPure(
                    context.gameState,
                    event.output.seat,
                    event.output.action,
                  ),
                  // Nobody undoes past an AI move.
                  undo: null,
                })),
              ),
            },
            // Back through the delay, so a persistent failure never hot-loops.
            onError: { target: "aiThinking" },
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
// Spec
// ---------------------------------------------------------------------------

function legalActionsFor(
  snapshot: SnapshotFrom<typeof theHungerMachine>,
  player: number,
): Action[] {
  const gs = snapshot.context.gameState;
  if (!gs) return [];
  const legal = getLegalActions(gs, player);
  const undo = snapshot.context.undo;
  if (undo && undo.player === player && getActivePlayer(gs) === player && undo.states.length > 0) {
    legal.push({ type: "undo" });
  }
  return legal;
}

export const theHungerSpec: GameMachineSpec<
  typeof theHungerMachine,
  HungerPlayerView,
  Action,
  HungerResult
> = {
  machine: theHungerMachine,

  getPlayerView(snapshot, player) {
    const gs = snapshot.context.gameState;
    if (!gs) throw new Error("The Hunger has not started");
    return buildPlayerView(gs, player);
  },

  getLegalActions(snapshot, player) {
    return legalActionsFor(snapshot, player);
  },

  validateAction: playerActionValidator({
    legalActions: legalActionsFor,
    toEvent: (action) => ({ type: "PLAYER_ACTION", action }) as const,
  }),

  getActivePlayer(snapshot) {
    const gs = snapshot.context.gameState;
    if (!gs) return -1;
    return getActivePlayer(gs);
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    if (!gs || gs.phase !== "game-over") return null;
    return gs.result;
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getReplayLog(snapshot) {
    const gs = snapshot.context.gameState;
    if (!gs || gs.phase !== "game-over" || !gs.result) return null;
    const n = gs.players.length;
    const { scores, winner, winners, placements, breakdown } = gs.result;
    return {
      scores,
      winner,
      winners,
      placements,
      breakdown,
      playerCount: n,
      seed: gs.seed,
      options: gs.options,
      strategies: gs.players.map((p) => p.aiStrategy ?? null),
      log: gs.log,
      scoreA: n === 2 ? scores[0] : undefined,
      scoreB: n === 2 ? scores[1] : undefined,
    };
  },
};
