import { assign, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import type { NashAnalysis } from "./ai/nash";
import { getLastNashAnalysis } from "./ai/nash";
import type { StrategyFn, StrategyId } from "./ai/strategy";
import { createStrategy } from "./ai/strategy";
import { applyRevealAndRotate, applySelection, createInitialState } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import type {
  ActionLogEntry,
  Card,
  GamePhase,
  GameState,
  RevealedCards,
  Selection,
  SushiGoAction,
} from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface SushiGoContext {
  gameState: GameState;
  humanPlayers: number[];
  strategy: StrategyFn;
  strategyId: string;
  nashAnalysis: NashAnalysis | null;
}

export type SushiGoEvent =
  | { type: "START"; playerCount: number; humanPlayers?: number[]; strategyId?: string }
  | { type: "PLAYER_ACTION"; playerIndex: number; action: SushiGoAction }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Player view (hidden info stripped)
// ---------------------------------------------------------------------------

export interface SushiGoPlayerView {
  phase: GamePhase;
  round: number;
  turn: number;
  playerCount: number;
  hand: Card[];
  hasSelected: boolean;
  strategyId?: string;
  players: {
    index: number;
    handCount: number;
    hand?: Card[];
    hasSelected: boolean;
    tableau: Card[];
    wasabiBoostedNigiriIds: number[];
    unusedWasabi: number;
    puddings: number;
  }[];
  lastRevealed: RevealedCards[];
  roundScores: number[][];
  totalScores: number[];
  actionLog: ActionLogEntry[];
  nashAnalysis: NashAnalysis | null;
}

export interface SushiGoResult {
  totalScores: number[];
  roundScores: number[][];
  winner: number;
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

const randomFallback = createStrategy("random");

function applyAiSelections(gs: GameState, humanPlayers: number[], strategy: StrategyFn): GameState {
  let state = gs;
  for (let i = 0; i < state.playerCount; i++) {
    if (!humanPlayers.includes(i) && state.selections[i] === null) {
      const hand = state.players[i].hand;
      if (hand.length > 0) {
        const selection = state.playerCount === 2 ? strategy(state, i) : randomFallback(state, i);
        state = applySelection(state, i, selection);
      }
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const sushiGoMachine = setup({
  types: {} as {
    context: SushiGoContext;
    events: SushiGoEvent;
  },

  delays: {
    revealDelay: 1200,
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    allSelected: ({ context }) => {
      const gs = context.gameState;
      return gs.phase === "selecting" && gs.selections.every((s) => s !== null);
    },
    needsAiFill: ({ context }) => {
      const gs = context.gameState;
      if (context.humanPlayers.length >= gs.playerCount) return false;
      return (
        gs.phase === "selecting" &&
        gs.selections.some((s, i) => s === null && !context.humanPlayers.includes(i))
      );
    },
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      const gs = createInitialState(event.playerCount);
      const humanPlayers =
        event.humanPlayers ?? Array.from({ length: event.playerCount }, (_, i) => i);
      const stratId = (event.strategyId ?? "nash") as StrategyId;
      const strategy = createStrategy(stratId);
      return { gameState: gs, humanPlayers, strategy, strategyId: stratId, nashAnalysis: null };
    }),

    applyPlayerSelection: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      const { playerIndex, action } = event;
      const selection: Selection =
        action.type === "select-card"
          ? { cardId: action.cardId }
          : {
              cardId: action.cardId,
              secondCardId: action.secondCardId,
            };
      return {
        gameState: applySelection(context.gameState, playerIndex, selection),
      };
    }),

    fillAiSelections: assign(({ context }) => {
      const gameState = applyAiSelections(
        context.gameState,
        context.humanPlayers,
        context.strategy,
      );
      return { gameState, nashAnalysis: getLastNashAnalysis() };
    }),

    applyReveal: assign(({ context }) => {
      return { gameState: applyRevealAndRotate(context.gameState) };
    }),
  },
}).createMachine({
  id: "sushiGo",
  initial: "idle",
  context: {
    gameState: PLACEHOLDER,
    humanPlayers: [0],
    strategy: createStrategy("nash"),
    strategyId: "nash",
    nashAnalysis: null,
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
            { guard: "isGameOver", target: "#sushiGo.gameOver" },
            { guard: "allSelected", target: "revealing" },
            { target: "selecting" },
          ],
        },

        selecting: {
          always: {
            guard: "needsAiFill",
            target: "routing",
            actions: "fillAiSelections",
          },
          on: {
            PLAYER_ACTION: {
              target: "routing",
              actions: "applyPlayerSelection",
            },
          },
        },

        revealing: {
          after: {
            revealDelay: { target: "routing", actions: "applyReveal" },
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

function buildPlayerView(ctx: SushiGoContext, player: number): SushiGoPlayerView {
  const gs = ctx.gameState;
  // In 2-player games from turn 2+, both hands are known (perfect info after first swap)
  const showAllHands = gs.playerCount === 2 && gs.turn >= 2;
  return {
    phase: gs.phase,
    round: gs.round,
    turn: gs.turn,
    playerCount: gs.playerCount,
    hand: gs.players[player]?.hand ?? [],
    hasSelected: gs.selections[player] !== null,
    strategyId: ctx.strategyId,
    players: gs.players.map((p, i) => ({
      index: i,
      handCount: p.hand.length,
      hand: showAllHands || i === player ? p.hand : undefined,
      hasSelected: gs.selections[i] !== null,
      tableau: p.tableau,
      wasabiBoostedNigiriIds: p.wasabiBoostedNigiriIds,
      unusedWasabi: p.unusedWasabi,
      puddings: p.puddings,
    })),
    lastRevealed: gs.lastRevealed,
    roundScores: gs.roundScores,
    totalScores: gs.totalScores,
    actionLog: gs.actionLog,
    nashAnalysis: ctx.nashAnalysis,
  };
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const sushiGoSpec: GameMachineSpec<
  typeof sushiGoMachine,
  SushiGoPlayerView,
  SushiGoAction,
  SushiGoResult
> = {
  machine: sushiGoMachine,

  getPlayerView(snapshot, player) {
    return buildPlayerView(snapshot.context, player);
  },

  getLegalActions(snapshot, player) {
    return getLegalActions(snapshot.context.gameState, player);
  },

  getActivePlayer(snapshot) {
    return getActivePlayer(snapshot.context.gameState);
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    if (gs.phase !== "game-over") return null;
    const maxScore = Math.max(...gs.totalScores);
    const topPlayers = gs.totalScores.map((s, i) => ({ s, i })).filter((x) => x.s === maxScore);

    // Tiebreak: most puddings
    let winner: number;
    if (topPlayers.length === 1) {
      winner = topPlayers[0].i;
    } else {
      winner = topPlayers.reduce((best, cur) =>
        gs.players[cur.i].puddings > gs.players[best.i].puddings ? cur : best,
      ).i;
    }

    return {
      totalScores: gs.totalScores,
      roundScores: gs.roundScores,
      winner,
    };
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },
};
