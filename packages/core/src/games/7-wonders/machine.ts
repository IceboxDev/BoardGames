import { assign, fromPromise, setup } from "xstate";
import { randomSeed } from "../../lib/rng";
import type { GameMachineSpec } from "../../machines/types";
import { randomLegalAction } from "./ai/random";
import { countShields, scienceProfile } from "./board";
import { applyPendingAction, applyReveal, applySelection, createInitialState } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import type { ScoreBreakdown } from "./scoring";
import { determineWinner, scoreFinal } from "./scoring";
import type {
  Age,
  CardId,
  EdificeSlot,
  GamePhase,
  GameState,
  LogEntry,
  PendingAction,
  RevealedPlay,
  ScienceSymbol,
  Selection,
  SevenWondersAction,
  WonderId,
} from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface SevenWondersContext {
  gameState: GameState;
  humanPlayers: number[];
  /** AI selections computed in parallel with human input — applied when all humans have selected. */
  pendingAiSelections: (Selection | null)[] | null;
}

export type SevenWondersEvent =
  | {
      type: "START";
      playerCount: number;
      humanPlayers?: number[];
      seed?: number;
      sideMode?: "A" | "B" | "random";
      edifice?: boolean;
    }
  | { type: "PLAYER_ACTION"; playerIndex: number; action: SevenWondersAction }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Player view (hidden info stripped; `me: null` is the spectator shape)
// ---------------------------------------------------------------------------

export interface SevenWondersPlayerBoardView {
  index: number;
  wonderId: WonderId;
  side: "A" | "B";
  stagesBuilt: number;
  coins: number;
  shields: number;
  militaryTokens: number[];
  tableau: CardId[];
  scienceCounts: Record<ScienceSymbol, number>;
  scienceWildcards: number;
  handCount: number;
  hasSelected: boolean;
}

export interface SevenWondersPlayerBoardEdifice {
  victoryTokens: number[];
  debtTokens: number[];
  /** Ages this player holds a participation pawn for. */
  participation: Age[];
}

export interface SevenWondersPlayerView {
  phase: GamePhase;
  age: Age;
  turn: number;
  playerCount: number;
  /** null = spectator (used by the BGA bridge); hands stay hidden. */
  me: { index: number; hand: CardId[]; hasSelected: boolean } | null;
  players: SevenWondersPlayerBoardView[];
  discardCount: number;
  /** Only present for the Halikarnassos player while their pick is pending. */
  discardCards?: CardId[];
  pending: PendingAction | null;
  /** Edifice projects, one per Age. Absent in a base game. */
  edifices?: EdificeSlot[];
  /** Per-player Edifice holdings (tokens/pawns), aligned with `players`. */
  playerEdifice?: SevenWondersPlayerBoardEdifice[];
  lastRevealed: RevealedPlay[];
  actionLog: LogEntry[];
}

export interface SevenWondersResult {
  breakdowns: ScoreBreakdown[];
  totals: number[];
  winner: number;
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

/**
 * Compute selections for every unselected AI seat WITHOUT mutating state.
 * Safe to run in parallel with human input: the draft is simultaneous, so an
 * AI's legal actions depend only on the shared start-of-turn state.
 */
function computeAiSelectionsPure(gs: GameState, humanPlayers: number[]): (Selection | null)[] {
  const selections: (Selection | null)[] = new Array(gs.playerCount).fill(null);
  for (let i = 0; i < gs.playerCount; i++) {
    if (!humanPlayers.includes(i) && gs.selections[i] === null && gs.hands[i].length > 0) {
      selections[i] = randomLegalAction(gs, i);
    }
  }
  return selections;
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const sevenWondersMachine = setup({
  types: {} as {
    context: SevenWondersContext;
    events: SevenWondersEvent;
  },

  delays: {
    revealDelay: 1400,
  },

  actors: {
    computeAiSelections: fromPromise(
      async ({ input }: { input: { gameState: GameState; humanPlayers: number[] } }) => {
        // Runs on the SERVER. Yield a macrotask so the session manager can
        // flush state to clients before any synchronous work.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return { selections: computeAiSelectionsPure(input.gameState, input.humanPlayers) };
      },
    ),

    computePendingAction: fromPromise(
      async ({ input }: { input: { gameState: GameState; playerIndex: number } }) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return { action: randomLegalAction(input.gameState, input.playerIndex) };
      },
    ),
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    isRevealing: ({ context }) => context.gameState.phase === "revealing",
    isPending: ({ context }) => context.gameState.phase === "pending",
    pendingIsAi: ({ context }) => {
      const pending = context.gameState.pendingQueue[0];
      return pending !== undefined && !context.humanPlayers.includes(pending.playerIndex);
    },
    isPendingPlayer: ({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return false;
      return context.gameState.pendingQueue[0]?.playerIndex === event.playerIndex;
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
      const gs = createInitialState({
        playerCount: event.playerCount,
        seed: event.seed ?? randomSeed(),
        sideMode: event.sideMode ?? "random",
        edifice: event.edifice,
      });
      const humanPlayers =
        event.humanPlayers ?? Array.from({ length: event.playerCount }, (_, i) => i);
      return { gameState: gs, humanPlayers, pendingAiSelections: null };
    }),

    applyPlayerSelection: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return {
        gameState: applySelection(context.gameState, event.playerIndex, event.action),
      };
    }),

    applyCachedAiSelections: assign(({ context }) => {
      const cached = context.pendingAiSelections;
      if (!cached) return { pendingAiSelections: null };
      let state = context.gameState;
      for (let i = 0; i < state.playerCount; i++) {
        const sel = cached[i];
        if (sel !== null && state.selections[i] === null) {
          state = applySelection(state, i, sel);
        }
      }
      return { gameState: state, pendingAiSelections: null };
    }),

    applyReveal: assign(({ context }) => {
      return { gameState: applyReveal(context.gameState) };
    }),

    applyHumanPending: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return {
        gameState: applyPendingAction(context.gameState, event.playerIndex, event.action),
      };
    }),
  },
}).createMachine({
  id: "sevenWonders",
  initial: "idle",
  context: {
    gameState: PLACEHOLDER,
    humanPlayers: [0],
    pendingAiSelections: null,
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
            { guard: "isGameOver", target: "#sevenWonders.gameOver" },
            { guard: "isPending", target: "pendingAction" },
            { guard: "isRevealing", target: "revealing" },
            { target: "selecting" },
          ],
        },

        selecting: {
          // Parallel: the AI decides while humans think — the draft is
          // simultaneous, so AI legality can't be affected by human picks.
          type: "parallel",
          onDone: {
            target: "routing",
            actions: "applyCachedAiSelections",
          },
          states: {
            aiCompute: {
              initial: "check",
              states: {
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
                    }),
                    onDone: {
                      target: "done",
                      actions: assign(({ event }) => ({
                        pendingAiSelections: event.output.selections,
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
                      { actions: "applyPlayerSelection" },
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

        pendingAction: {
          initial: "check",
          states: {
            check: {
              always: [{ guard: "pendingIsAi", target: "aiActing" }, { target: "waiting" }],
            },
            aiActing: {
              invoke: {
                id: "computePendingAction",
                src: "computePendingAction",
                input: ({ context }) => ({
                  gameState: context.gameState,
                  playerIndex: context.gameState.pendingQueue[0]?.playerIndex ?? 0,
                }),
                onDone: {
                  target: "#sevenWonders.active.routing",
                  actions: assign(({ context, event }) => {
                    const pending = context.gameState.pendingQueue[0];
                    const action = event.output.action;
                    if (!pending || !action) return {};
                    return {
                      gameState: applyPendingAction(context.gameState, pending.playerIndex, action),
                    };
                  }),
                },
                onError: { target: "#sevenWonders.active.routing" },
              },
            },
            waiting: {
              on: {
                PLAYER_ACTION: {
                  guard: "isPendingPlayer",
                  target: "#sevenWonders.active.routing",
                  actions: "applyHumanPending",
                },
              },
            },
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

/** `player: -1` (or any unseated index) produces the spectator view. */
export function buildPlayerView(ctx: SevenWondersContext, player: number): SevenWondersPlayerView {
  const gs = ctx.gameState;
  const seated = player >= 0 && player < gs.playerCount;
  const pending = gs.pendingQueue[0] ?? null;
  const showDiscard = seated && pending?.kind === "halikarnassos" && pending.playerIndex === player;
  return {
    phase: gs.phase,
    age: gs.age,
    turn: gs.turn,
    playerCount: gs.playerCount,
    me: seated
      ? {
          index: player,
          hand: gs.hands[player],
          hasSelected: gs.selections[player] !== null,
        }
      : null,
    players: gs.players.map((p, i) => {
      const science = scienceProfile(p);
      return {
        index: i,
        wonderId: p.wonderId,
        side: p.side,
        stagesBuilt: p.stagesBuilt,
        coins: p.coins,
        shields: countShields(p),
        militaryTokens: p.militaryTokens,
        tableau: p.tableau,
        scienceCounts: science.counts,
        scienceWildcards: science.wildcards,
        handCount: gs.hands[i].length,
        hasSelected: gs.selections[i] !== null,
      };
    }),
    discardCount: gs.discard.length,
    ...(showDiscard ? { discardCards: gs.discard } : {}),
    pending,
    ...(gs.edifices
      ? {
          edifices: gs.edifices,
          playerEdifice: gs.players.map((p, i) => ({
            victoryTokens: p.victoryTokens,
            debtTokens: p.debtTokens,
            participation: (gs.edifices ?? [])
              .filter((slot) => slot.participants.includes(i))
              .map((slot) => slot.age),
          })),
        }
      : {}),
    lastRevealed: gs.lastRevealed,
    actionLog: gs.actionLog,
  };
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const sevenWondersSpec: GameMachineSpec<
  typeof sevenWondersMachine,
  SevenWondersPlayerView,
  SevenWondersAction,
  SevenWondersResult
> = {
  machine: sevenWondersMachine,

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
    const breakdowns = scoreFinal(gs);
    return {
      breakdowns,
      totals: breakdowns.map((b) => b.total),
      winner: determineWinner(gs, breakdowns),
    };
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },
};
