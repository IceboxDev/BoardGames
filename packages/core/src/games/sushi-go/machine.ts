import { assign, fromPromise, setup } from "xstate";
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
  /** AI selections computed in parallel with human input — applied when all humans have selected. */
  pendingAiSelections: (Selection | null)[] | null;
  pendingNashAnalysis: NashAnalysis | null;
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

/**
 * Computes AI selections WITHOUT mutating game state. Returns a per-player
 * array where only AI slots are populated. Safe to run in parallel with
 * human input because sushi-go is simultaneous-move — the AI's decision
 * only depends on the shared state at the start of the turn, not on what
 * the human eventually picks.
 */
function computeAiSelectionsPure(
  gs: GameState,
  humanPlayers: number[],
  strategy: StrategyFn,
): (Selection | null)[] {
  const selections: (Selection | null)[] = new Array(gs.playerCount).fill(null);
  for (let i = 0; i < gs.playerCount; i++) {
    if (!humanPlayers.includes(i) && gs.selections[i] === null) {
      const hand = gs.players[i].hand;
      if (hand.length > 0) {
        selections[i] = gs.playerCount === 2 ? strategy(gs, i) : randomFallback(gs, i);
      }
    }
  }
  return selections;
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

  actors: {
    computeAiSelections: fromPromise(
      async ({
        input,
      }: {
        input: { gameState: GameState; humanPlayers: number[]; strategy: StrategyFn };
      }) => {
        // Yield a macrotask so the UI can render the post-reveal state before
        // Nash solving blocks the main thread. Without this, the transition out
        // of `revealing` is visually stuck until the solver finishes.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const selections = computeAiSelectionsPure(
          input.gameState,
          input.humanPlayers,
          input.strategy,
        );
        return { selections, nashAnalysis: getLastNashAnalysis() };
      },
    ),
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    allSelected: ({ context }) => {
      const gs = context.gameState;
      return gs.phase === "selecting" && gs.selections.every((s) => s !== null);
    },
    noAiPlayers: ({ context }) => {
      return context.humanPlayers.length >= context.gameState.playerCount;
    },
    allHumansAlreadySelected: ({ context }) => {
      const gs = context.gameState;
      return context.humanPlayers.every((p) => gs.selections[p] !== null);
    },
    lastHumanSelected: ({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return false;
      const gs = context.gameState;
      const humansNotSelected = context.humanPlayers.filter((p) => gs.selections[p] === null);
      return humansNotSelected.length === 1 && humansNotSelected[0] === event.playerIndex;
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
      return {
        gameState: gs,
        humanPlayers,
        strategy,
        strategyId: stratId,
        nashAnalysis: null,
        pendingAiSelections: null,
        pendingNashAnalysis: null,
      };
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

    applyCachedAiSelections: assign(({ context }) => {
      const cached = context.pendingAiSelections;
      if (!cached) {
        return { pendingAiSelections: null, pendingNashAnalysis: null };
      }
      let state = context.gameState;
      for (let i = 0; i < state.playerCount; i++) {
        const sel = cached[i];
        if (sel !== null && state.selections[i] === null) {
          state = applySelection(state, i, sel);
        }
      }
      return {
        gameState: state,
        nashAnalysis: context.pendingNashAnalysis,
        pendingAiSelections: null,
        pendingNashAnalysis: null,
      };
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
    pendingAiSelections: null,
    pendingNashAnalysis: null,
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
          // Parallel: AI computes its selections concurrently with human input.
          // Sushi-go is simultaneous-move, so the AI's pick only depends on the
          // shared state at the start of the turn — not on what the human picks.
          // This lets the AI use the human's thinking time instead of blocking
          // the main thread after the human clicks.
          type: "parallel",
          onDone: {
            target: "routing",
            actions: "applyCachedAiSelections",
          },
          states: {
            aiCompute: {
              initial: "check",
              states: {
                // Separate `check` state so the `noAiPlayers` short-circuit is
                // decided BEFORE the actor is invoked — avoids any ambiguity
                // about ordering between `always` transitions and invoke startup.
                check: {
                  always: [{ guard: "noAiPlayers", target: "done" }, { target: "deciding" }],
                },
                deciding: {
                  invoke: {
                    id: "computeAiSelections",
                    src: "computeAiSelections",
                    input: ({ context }) => ({
                      gameState: context.gameState,
                      humanPlayers: context.humanPlayers,
                      strategy: context.strategy,
                    }),
                    onDone: {
                      target: "done",
                      actions: assign(({ event }) => ({
                        pendingAiSelections: event.output.selections,
                        pendingNashAnalysis: event.output.nashAnalysis,
                      })),
                    },
                    onError: { target: "done" },
                  },
                },
                done: { type: "final" },
              },
            },
            humanInput: {
              initial: "waiting",
              states: {
                waiting: {
                  always: [{ guard: "allHumansAlreadySelected", target: "done" }],
                  on: {
                    PLAYER_ACTION: [
                      {
                        guard: "lastHumanSelected",
                        target: "done",
                        actions: "applyPlayerSelection",
                      },
                      {
                        // Multi-human MP: apply this human's selection and wait
                        // for the remaining humans (internal transition, `always`
                        // re-evaluates after the context mutation).
                        actions: "applyPlayerSelection",
                      },
                    ],
                  },
                },
                done: { type: "final" },
              },
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
