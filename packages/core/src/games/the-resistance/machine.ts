import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { rngFrom } from "../../lib/rng";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import { strategyGuard, typedSeatStrategies } from "../../machines/seats";
import type { GameMachineSpec } from "../../machines/types";
import { decideAction } from "./ai-strategies";
import {
  applyAction,
  createInitialState,
  getActivePlayer,
  getLegalActions,
  pendingSeats,
} from "./game-engine";
import { type ResistanceConfig, resistanceManifest } from "./manifest";
import { resistanceOutcome } from "./outcome";
import { buildPlayerView } from "./player-view";
import type { ResistanceReplayLog } from "./record";
import {
  AI_STRATEGY_LABELS,
  type AIStrategyId,
  type GameState,
  type ResistanceAction,
  type ResistancePlayerView,
  type ResistanceResult,
} from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface ResistanceContext {
  gameState: GameState;
  seed: number;
  liveSolver: boolean;
}

export type ResistanceEvent =
  | {
      type: "START";
      strategies: (AIStrategyId | null)[];
      config: ResistanceConfig;
      seed: number;
    }
  | { type: "PLAYER_ACTION"; action: ResistanceAction; player: number }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

function botMove(state: GameState, seat: number): { state: GameState; action: ResistanceAction } {
  const strategy = state.strategies[seat];
  if (!strategy) throw new Error(`Seat ${seat} is not a bot`);
  const next = structuredClone(state);
  const action = decideAction(
    strategy,
    buildPlayerView(next, seat),
    getLegalActions(next, seat),
    rngFrom(next),
  );
  return { state: next, action };
}

function isAiLeader(gs: GameState): boolean {
  if (gs.phase !== "proposing") return false;
  return gs.strategies[getActivePlayer(gs)] != null;
}

/** Bots that still owe a vote or a card this phase. */
function pendingBots(gs: GameState): number[] {
  return pendingSeats(gs).filter((seat) => gs.strategies[seat] != null);
}

/**
 * Every bot votes / plays its card the moment the phase opens. They're hidden
 * until the last person submits (the view shows only "submitted"), and a bot's
 * choice depends only on what was known when the phase began.
 */
function fillBots(gs: GameState): GameState {
  let state = gs;
  const phase = state.phase;
  for (const seat of pendingBots(state)) {
    if (state.phase !== phase) break;
    const move = botMove(state, seat);
    state = applyAction(move.state, seat, move.action);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const resistanceMachine = setup({
  types: {} as {
    context: ResistanceContext;
    events: ResistanceEvent;
  },

  delays: {
    aiDelay: 900,
    phaseDelay: 500,
  },

  actors: {
    computeProposal: fromPromise(async ({ input }: { input: { state: GameState } }) => {
      return botMove(input.state, getActivePlayer(input.state));
    }),
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    isAiLeader: ({ context }) => isAiLeader(context.gameState),
    hasPendingBots: ({ context }) => pendingBots(context.gameState).length > 0,
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("the-resistance", () => ({
        gameState: createInitialState({
          playerCount: event.strategies.length,
          strategies: event.strategies,
          variants: { targeting: event.config.targeting, blindSpies: event.config.blindSpies },
          seed: event.seed,
        }),
        seed: event.seed,
        liveSolver: event.config.liveSolver,
      }));
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return safeApply("the-resistance", () => ({
        gameState: applyAction(context.gameState, event.player, event.action),
      }));
    }),

    applyAiProposal: assign(({ context, event }) => {
      const output = (event as unknown as { output: ReturnType<typeof botMove> }).output;
      const seat = getActivePlayer(context.gameState);
      return safeApply("the-resistance", () => ({
        gameState: applyAction(output.state, seat, output.action),
      }));
    }),

    fillBots: assign(({ context }) =>
      safeApply("the-resistance", () => ({ gameState: fillBots(context.gameState) })),
    ),
  },
}).createMachine({
  id: "resistance",
  initial: "idle",
  context: { gameState: PLACEHOLDER, seed: 0, liveSolver: true },

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
            { guard: "isGameOver", target: "#resistance.gameOver" },
            { guard: "isAiLeader", target: "aiProposing" },
            { guard: "hasPendingBots", target: "botsSubmitting" },
            { target: "awaitingPlayers" },
          ],
        },

        awaitingPlayers: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        aiProposing: {
          invoke: {
            id: "computeProposal",
            src: "computeProposal",
            input: ({ context }) => ({ state: context.gameState }),
            onDone: { target: "aiDelay", actions: "applyAiProposal" },
            // Back off before retrying — straight to `routing` would spin.
            onError: { target: "aiDelay" },
          },
        },

        aiDelay: {
          after: { aiDelay: "routing" },
        },

        // A short beat so a phase the bots finish alone doesn't flash past.
        botsSubmitting: {
          after: { phaseDelay: { target: "routing", actions: "fillBots" } },
          on: {
            PLAYER_ACTION: { target: "routing", actions: ["applyPlayerAction", "fillBots"] },
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

type ResistanceSnapshot = SnapshotFrom<typeof resistanceMachine>;

function legalActionsFor(snapshot: ResistanceSnapshot, player: number): ResistanceAction[] {
  const gs = snapshot.context.gameState;
  // Context holds a placeholder until START.
  if (!gs) return [];
  if (gs.strategies[player] != null) return [];
  return getLegalActions(gs, player);
}

const toStrategy = strategyGuard("The Resistance", AI_STRATEGY_LABELS);

export const resistanceSpec: GameMachineSpec<
  typeof resistanceMachine,
  ResistancePlayerView | null,
  ResistanceAction,
  ResistanceResult,
  ResistanceConfig
> = {
  machine: resistanceMachine,
  manifest: resistanceManifest,

  buildStart: ({ seats, config, seed }) => ({
    type: "START",
    strategies: typedSeatStrategies(seats, toStrategy),
    config,
    seed,
  }),

  getPlayerView(snapshot, player) {
    const gs = snapshot.context.gameState;
    return gs ? buildPlayerView(gs, player, snapshot.context.liveSolver) : null;
  },

  getLegalActions(snapshot, player) {
    return legalActionsFor(snapshot, player);
  },

  validateAction: playerActionValidator({
    legalActions: legalActionsFor,
    toEvent: (action, player) => ({ type: "PLAYER_ACTION", action, player }) as const,
  }),

  getActivePlayer(snapshot) {
    const gs = snapshot.context.gameState;
    return gs ? getActivePlayer(gs) : -1;
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    const { winner, winReason, roles } = gs?.record ?? {};
    if (gs?.phase !== "game-over" || !winner || !winReason || !roles) return null;
    return { winner, winReason, roles };
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getOutcome(snapshot) {
    const gs = snapshot.context.gameState;
    if (gs?.phase !== "game-over" || !gs.record.winner) return null;
    return resistanceOutcome(gs.record.roles, gs.record.winner);
  },

  getReplayLog(snapshot): ResistanceReplayLog | null {
    const { gameState: gs, seed } = snapshot.context;
    if (gs?.phase !== "game-over") return null;
    return { formatVersion: 1, seed, ...structuredClone(gs.record) };
  },
};
