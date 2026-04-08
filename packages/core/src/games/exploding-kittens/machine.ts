import { assign, fromPromise, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import { getStrategy } from "./ai-strategies";
import { applyActionPure, createInitialState } from "./game-engine";
import { runISMCTS } from "./mcts/ismcts";
import { getActiveDecider, getLegalActions } from "./rules";
import type { Action, ActionLogEntry, AIStrategyId, Card, GamePhase, GameState } from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface EKContext {
  gameState: GameState;
}

export type EKEvent =
  | { type: "START"; playerCount: number; strategies: (AIStrategyId | null)[] }
  | { type: "PLAYER_ACTION"; action: Action }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Player view (hidden info stripped)
// ---------------------------------------------------------------------------

export interface EKPlayerView {
  phase: GamePhase;
  hand: Card[];
  drawPileCount: number;
  discardPile: Card[];
  players: {
    index: number;
    type: "human" | "ai";
    handCount: number;
    alive: boolean;
    aiStrategy?: AIStrategyId;
  }[];
  currentPlayerIndex: number;
  turnsRemaining: number;
  turnCount: number;
  nopeWindow: GameState["nopeWindow"];
  favorContext: GameState["favorContext"];
  stealContext: GameState["stealContext"];
  discardPickContext: GameState["discardPickContext"];
  peekContext: GameState["peekContext"] | null;
  explosionContext: GameState["explosionContext"];
  actionLog: ActionLogEntry[];
  winner: number | null;
}

export interface EKResult {
  winner: number;
  winnerIsHuman: boolean;
  turnCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAiDecider(gs: GameState): boolean {
  if (gs.phase === "game-over" || gs.phase === "setup") return false;
  const decider = getActiveDecider(gs);
  const player = gs.players[decider];
  return !!player && player.type === "ai";
}

function computeAiAction(gs: GameState): Action {
  const decider = getActiveDecider(gs);
  const player = gs.players[decider];
  const strategyId = player.aiStrategy ?? "heuristic-v1";
  const strategy = getStrategy(strategyId);
  const legal = getLegalActions(gs);
  if (legal.length === 0) throw new Error("No legal actions for AI");

  if (strategy.mctsConfig) {
    return runISMCTS(gs, decider, strategy.mctsConfig);
  }
  return strategy.pickAction(gs, legal, decider);
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const explodingKittensMachine = setup({
  types: {} as {
    context: EKContext;
    events: EKEvent;
  },

  delays: {
    aiActionDelay: 500,
    aiNopeDelay: 300,
  },

  actors: {
    computeAiMove: fromPromise(async ({ input }: { input: { state: GameState } }) => {
      return computeAiAction(input.state);
    }),
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    isAiTurn: ({ context }) => isAiDecider(context.gameState),
    isActionPhase: ({ context }) => context.gameState.phase === "action-phase",
    isNopeWindow: ({ context }) => context.gameState.phase === "nope-window",
    isResolvingFavor: ({ context }) => context.gameState.phase === "resolving-favor",
    isChoosingTarget: ({ context }) => context.gameState.phase === "choosing-target",
    isChoosingCardName: ({ context }) => context.gameState.phase === "choosing-card-name",
    isChoosingDiscard: ({ context }) => context.gameState.phase === "choosing-discard",
    isPeeking: ({ context }) => context.gameState.phase === "peeking",
    isDrawing: ({ context }) => context.gameState.phase === "drawing",
    isExploding: ({ context }) => context.gameState.phase === "exploding",
    isReinserting: ({ context }) => context.gameState.phase === "reinserting",
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
  id: "ek",
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
            { guard: "isGameOver", target: "#ek.gameOver" },
            { guard: "isAiTurn", target: "aiComputing" },
            { guard: "isActionPhase", target: "actionPhase" },
            { guard: "isNopeWindow", target: "nopeWindow" },
            { guard: "isResolvingFavor", target: "resolvingFavor" },
            { guard: "isChoosingTarget", target: "choosingTarget" },
            { guard: "isChoosingCardName", target: "choosingCardName" },
            { guard: "isChoosingDiscard", target: "choosingDiscard" },
            { guard: "isPeeking", target: "peeking" },
            { guard: "isDrawing", target: "drawing" },
            { guard: "isExploding", target: "exploding" },
            { guard: "isReinserting", target: "reinserting" },
          ],
        },

        actionPhase: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        nopeWindow: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        resolvingFavor: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        choosingTarget: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        choosingCardName: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        choosingDiscard: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        peeking: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        drawing: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        exploding: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        reinserting: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        aiComputing: {
          invoke: {
            id: "computeAiMove",
            src: "computeAiMove",
            input: ({ context }) => ({ state: context.gameState }),
            onDone: { target: "routing", actions: "applyAiAction" },
            onError: { target: "routing" },
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
// Projection functions
// ---------------------------------------------------------------------------

function buildPlayerView(ctx: EKContext, player: number): EKPlayerView {
  const gs = ctx.gameState;
  const isActive = getActiveDecider(gs) === player;
  return {
    phase: gs.phase,
    hand: gs.players[player]?.hand ?? [],
    drawPileCount: gs.drawPile.length,
    discardPile: gs.discardPile,
    players: gs.players.map((p) => ({
      index: p.index,
      type: p.type,
      handCount: p.hand.length,
      alive: p.alive,
      aiStrategy: p.aiStrategy,
    })),
    currentPlayerIndex: gs.currentPlayerIndex,
    turnsRemaining: gs.turnsRemaining,
    turnCount: gs.turnCount,
    nopeWindow: gs.nopeWindow,
    favorContext: gs.favorContext,
    stealContext: gs.stealContext,
    discardPickContext: gs.discardPickContext,
    peekContext: isActive ? gs.peekContext : null,
    explosionContext: gs.explosionContext,
    actionLog: gs.actionLog ?? [],
    winner: gs.winner,
  };
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const explodingKittensSpec: GameMachineSpec<
  typeof explodingKittensMachine,
  EKPlayerView,
  Action,
  EKResult
> = {
  machine: explodingKittensMachine,

  getPlayerView(snapshot, player) {
    return buildPlayerView(snapshot.context, player);
  },

  getLegalActions(snapshot, player) {
    const gs = snapshot.context.gameState;
    const active = getActiveDecider(gs);
    if (active !== player) return [];
    return getLegalActions(gs);
  },

  getActivePlayer(snapshot) {
    return getActiveDecider(snapshot.context.gameState);
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    if (gs.phase !== "game-over") return null;
    const winner = gs.winner ?? 0;
    return {
      winner,
      winnerIsHuman: gs.players[winner]?.type === "human",
      turnCount: gs.turnCount,
    };
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getReplayLog(snapshot) {
    const gs = snapshot.context.gameState;
    if (gs.phase !== "game-over") return null;
    return {
      scoreA: gs.winner === 0 ? 1 : 0,
      scoreB: gs.winner === 1 ? 1 : 0,
      winner: gs.winner,
      turnCount: gs.turnCount,
    };
  },
};
