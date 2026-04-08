import { assign, fromPromise, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import { getStrategy } from "./ai-strategies";
import { applyActionPure, createInitialState } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import type { Action, AIStrategyId, DurakPlayerView, DurakResult, GameState } from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface DurakContext {
  gameState: GameState;
}

export type DurakEvent =
  | { type: "START"; playerCount: number; strategies: (AIStrategyId | null)[] }
  | { type: "PLAYER_ACTION"; action: Action }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAiTurn(gs: GameState): boolean {
  if (gs.phase === "game-over" || gs.phase === "idle") return false;
  const active = getActivePlayer(gs);
  const player = gs.players[active];
  return !!player && player.type === "ai";
}

function computeAiAction(gs: GameState): Action {
  const active = getActivePlayer(gs);
  const player = gs.players[active];
  const strategyId = player.aiStrategy ?? "random";
  const strategy = getStrategy(strategyId);
  const legal = getLegalActions(gs);
  if (legal.length === 0) throw new Error("No legal actions for AI");
  return strategy.pickAction(gs, legal, active);
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const durakMachine = setup({
  types: {} as {
    context: DurakContext;
    events: DurakEvent;
  },

  delays: {
    aiDelay: 400,
  },

  actors: {
    computeAiMove: fromPromise(async ({ input }: { input: { state: GameState } }) => {
      return computeAiAction(input.state);
    }),
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    isAiTurn: ({ context }) => isAiTurn(context.gameState),
    isAttacking: ({ context }) => context.gameState.phase === "attacking",
    isDefending: ({ context }) => context.gameState.phase === "defending",
    isThrowingIn: ({ context }) => context.gameState.phase === "throwing-in",
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return {
        gameState: createInitialState(event.playerCount, event.strategies),
      };
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return { gameState: applyActionPure(context.gameState, event.action) };
    }),

    applyAiAction: assign(({ context, event }) => {
      const action = (event as unknown as { output: Action }).output;
      return { gameState: applyActionPure(context.gameState, action) };
    }),
  },
}).createMachine({
  id: "durak",
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
            { guard: "isGameOver", target: "#durak.gameOver" },
            { guard: "isAiTurn", target: "aiComputing" },
            { guard: "isAttacking", target: "attackPhase" },
            { guard: "isDefending", target: "defendPhase" },
            { guard: "isThrowingIn", target: "throwingInPhase" },
          ],
        },

        attackPhase: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        defendPhase: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        throwingInPhase: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        aiComputing: {
          invoke: {
            id: "computeAiMove",
            src: "computeAiMove",
            input: ({ context }) => ({ state: context.gameState }),
            onDone: {
              target: "aiDelay",
              actions: "applyAiAction",
            },
            onError: { target: "routing" },
          },
        },

        aiDelay: {
          after: {
            aiDelay: "routing",
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
// Player view projection
// ---------------------------------------------------------------------------

function buildPlayerView(ctx: DurakContext, player: number): DurakPlayerView {
  const gs = ctx.gameState;
  return {
    phase: gs.phase,
    hand: gs.players[player]?.hand ?? [],
    trumpCard: gs.trumpCard,
    trumpSuit: gs.trumpSuit,
    table: gs.table,
    drawPileCount: gs.drawPile.length,
    discardPileCount: gs.discardPile.length,
    players: gs.players.map((p) => ({
      index: p.index,
      type: p.type,
      handCount: p.hand.length,
      isOut: p.isOut,
      aiStrategy: p.aiStrategy,
    })),
    attackerIndex: gs.attackerIndex,
    defenderIndex: gs.defenderIndex,
    turnCount: gs.turnCount,
    durak: gs.durak,
    actionLog: gs.actionLog,
  };
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const durakSpec: GameMachineSpec<typeof durakMachine, DurakPlayerView, Action, DurakResult> =
  {
    machine: durakMachine,

    getPlayerView(snapshot, player) {
      return buildPlayerView(snapshot.context, player);
    },

    getLegalActions(snapshot, player) {
      const gs = snapshot.context.gameState;
      const active = getActivePlayer(gs);
      if (active !== player) return [];
      return getLegalActions(gs);
    },

    getActivePlayer(snapshot) {
      return getActivePlayer(snapshot.context.gameState);
    },

    getResult(snapshot) {
      const gs = snapshot.context.gameState;
      if (gs.phase !== "game-over") return null;
      return {
        durak: gs.durak,
        isDraw: gs.durak === null,
        turnCount: gs.turnCount,
      };
    },

    isGameOver(snapshot) {
      return snapshot.matches("gameOver");
    },

    getReplayLog(snapshot) {
      const gs = snapshot.context.gameState;
      if (gs.phase !== "game-over") return null;
      const durak = gs.durak;
      return {
        scoreA: durak === 1 ? 1 : durak === null ? 0 : 0,
        scoreB: durak === 0 ? 1 : durak === null ? 0 : 0,
        durak,
        turnCount: gs.turnCount,
      };
    },
  };
