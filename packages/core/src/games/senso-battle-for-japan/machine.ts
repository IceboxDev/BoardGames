import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { randomSeed } from "../../lib/rng";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import type { GameMachineSpec } from "../../machines/types";
import { pickAiAction } from "./ai-strategies";
import { applyActionPure, createInitialState, settleTrickPure } from "./game-engine";
import { buildPlayerView } from "./player-view";
import { getActivePlayer, getLegalActions } from "./rules";
import type { Action, AIStrategyId, GameState, SensoPlayerView, SensoResult } from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

/** Pacing (ms). Tests START with `{ ai: 1, trickSettle: 1 }` under fake timers. */
export interface SensoBeats {
  /** Pause before an AI seat acts, so humans can read the board. */
  ai: number;
  /** How long a completed trick stays on the table before it is banked. */
  trickSettle: number;
}

export const DEFAULT_BEATS: SensoBeats = { ai: 500, trickSettle: 1200 };

export interface SensoContext {
  gameState: GameState;
  beats: SensoBeats;
}

export type SensoEvent =
  | {
      type: "START";
      playerCount: number;
      strategies: (AIStrategyId | null)[];
      seed?: number;
      beats?: Partial<SensoBeats>;
    }
  | { type: "PLAYER_ACTION"; action: Action }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

function isAiTurn(gs: GameState | null): boolean {
  if (!gs) return false;
  if (gs.phase !== "trick" && gs.phase !== "rewards" && gs.phase !== "bonus") return false;
  const active = getActivePlayer(gs);
  return gs.players[active]?.type === "ai";
}

function computeAiMove(gs: GameState): Action {
  const seat = getActivePlayer(gs);
  return pickAiAction(gs, seat, gs.players[seat]?.aiStrategy);
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const sensoMachine = setup({
  types: {} as {
    context: SensoContext;
    events: SensoEvent;
  },

  delays: {
    aiDelay: ({ context }) => context.beats.ai,
    trickSettle: ({ context }) => context.beats.trickSettle,
  },

  actors: {
    computeAiMove: fromPromise(async ({ input }: { input: { state: GameState } }) => {
      // Yield a macrotask so the session manager can flush the previous state
      // and the `ai-thinking` broadcast before the synchronous search runs.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return computeAiMove(input.state);
    }),
  },

  guards: {
    noGame: ({ context }) => !context.gameState,
    isGameOver: ({ context }) => context.gameState?.phase === "game-over",
    isTrickSettle: ({ context }) => context.gameState?.phase === "trick-settle",
    isAiTurn: ({ context }) => isAiTurn(context.gameState),
    isTrick: ({ context }) => context.gameState?.phase === "trick",
    isRewards: ({ context }) => context.gameState?.phase === "rewards",
    isBonus: ({ context }) => context.gameState?.phase === "bonus",
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("senso", () => ({
        gameState: createInitialState(
          event.playerCount,
          event.strategies,
          event.seed ?? randomSeed(),
        ),
        beats: { ...DEFAULT_BEATS, ...event.beats },
      }));
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return safeApply("senso", () => ({
        gameState: applyActionPure(context.gameState, event.action),
      }));
    }),

    settleTrick: assign(({ context }) =>
      safeApply("senso", () => ({ gameState: settleTrickPure(context.gameState) })),
    ),
  },
}).createMachine({
  id: "senso",
  initial: "idle",
  context: { gameState: PLACEHOLDER, beats: DEFAULT_BEATS },

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
            // START threw inside safeApply (bad config): never sit in routing
            // with a null game.
            { guard: "noGame", target: "#senso.idle" },
            { guard: "isGameOver", target: "#senso.gameOver" },
            // Before isAiTurn: nobody acts while a finished trick is on show.
            { guard: "isTrickSettle", target: "trickSettle" },
            { guard: "isAiTurn", target: "aiThinking" },
            { guard: "isTrick", target: "trickPlay" },
            { guard: "isRewards", target: "rewards" },
            { guard: "isBonus", target: "bonus" },
          ],
        },

        trickPlay: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },

        rewards: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },

        bonus: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },

        trickSettle: {
          after: { trickSettle: { target: "routing", actions: "settleTrick" } },
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
                safeApply("senso", () => ({
                  gameState: applyActionPure(context.gameState, event.output),
                })),
              ),
            },
            // Re-enter through the delay rather than routing, so a persistent
            // failure can never become a hot loop.
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
// Legal actions (single source of truth for the spec and the validator)
// ---------------------------------------------------------------------------

function legalActionsFor(snapshot: SnapshotFrom<typeof sensoMachine>, player: number): Action[] {
  const gs = snapshot.context.gameState;
  // Context holds a placeholder until START, so a pre-game snapshot has no state.
  if (!gs) return [];
  if (getActivePlayer(gs) !== player) return [];
  return getLegalActions(gs);
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const sensoSpec: GameMachineSpec<typeof sensoMachine, SensoPlayerView, Action, SensoResult> =
  {
    machine: sensoMachine,

    getPlayerView(snapshot, player) {
      const gs = snapshot.context.gameState;
      if (!gs) throw new Error("Sensō has not started");
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
      const { scores, winner, winners, placements, finalBoard } = gs.result;
      // No `durak` key: persistReplay treats any `durak` value as the winner.
      return {
        scores,
        winner,
        winners,
        placements,
        playerCount: n,
        seed: gs.seed,
        strategies: gs.players.map((p) => p.aiStrategy ?? null),
        clans: gs.players.map((p) => p.clan),
        emperorSeat: gs.emperorSeat,
        finalBoard,
        log: gs.log,
        // Legacy 2-player columns for the match-history table.
        scoreA: n === 2 ? scores[0] : undefined,
        scoreB: n === 2 ? scores[1] : undefined,
      };
    },
  };
