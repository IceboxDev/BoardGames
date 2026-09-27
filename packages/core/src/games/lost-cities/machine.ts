import { assign, fromPromise, setup } from "xstate";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import { firstAiStrategy, humanSeats, strategyGuard } from "../../machines/seats";
import type { GameMachineSpec } from "../../machines/types";
import { getStrategy } from "./ai-strategies";
import { applyDraw, applyPlay, createInitialState } from "./game-engine";
import { lostCitiesManifest } from "./manifest";
import type { MCTSStats } from "./mcts/ismcts";
import { runISMCTSWithStats } from "./mcts/ismcts";
import { lostCitiesOutcome } from "./outcome";
import type { LostCitiesReplayLog, MCTSActionStats, ReplayStepV2 } from "./replay-log";
import { buildGameLog, gameStateToSnapshot } from "./replay-log";
import { getLegalDraws, getLegalPlays } from "./rules";
import { scoreGame } from "./scoring";
import {
  type ActionLogEntry,
  AI_ENGINE_LABELS,
  type AIEngine,
  type Card,
  type DrawAction,
  EXPEDITION_COLORS,
  type ExpeditionColor,
  type GamePhase,
  type GameState,
  type PlayAction,
  type PlayerIndex,
  type PlayerScore,
} from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface LostCitiesContext {
  gameState: GameState;
  /** The deal's seed — with the replay steps, it reproduces the game. */
  seed: number;
  aiEngine: AIEngine;
  humanPlayers: number[];
  lastAiStats: MCTSStats | null;
  pendingAiDraw: DrawAction | null;
  actionLog: ActionLogEntry[];
  replaySteps: ReplayStepV2[];
}

export type LostCitiesEvent =
  | { type: "START"; aiEngine: AIEngine; humanPlayers: number[]; seed: number }
  | { type: "PLAY_TO_EXPEDITION"; cardId: number }
  | { type: "DISCARD"; cardId: number }
  | { type: "DRAW_FROM_PILE" }
  | { type: "DRAW_FROM_DISCARD"; color: ExpeditionColor }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Player view (hidden info stripped)
// ---------------------------------------------------------------------------

export interface LostCitiesPlayerView {
  playerHand: Card[];
  playerExpeditions: Record<ExpeditionColor, Card[]>;
  opponentExpeditions: Record<ExpeditionColor, Card[]>;
  discardPiles: Record<ExpeditionColor, Card[]>;
  drawPileCount: number;
  opponentHandCount: number;
  currentPlayer: PlayerIndex;
  turnPhase: "play" | "draw";
  phase: GamePhase;
  turnCount: number;
  playerScore: PlayerScore;
  opponentScore: PlayerScore;
  lastDiscardedColor: ExpeditionColor | null;
  actionLog: ActionLogEntry[];
}

export type LostCitiesLegalAction =
  | { phase: "play"; action: PlayAction }
  | { phase: "draw"; action: DrawAction };

export interface LostCitiesResult {
  scores: [PlayerScore, PlayerScore];
  winner: PlayerIndex | "draw";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCard(hand: Card[], cardId: number): Card {
  const c = hand.find((c) => c.id === cardId);
  if (!c) throw new Error(`Card ${cardId} not in hand`);
  return c;
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const lostCitiesMachine = setup({
  types: {} as {
    context: LostCitiesContext;
    events: LostCitiesEvent;
  },

  delays: {
    aiStepDelay: 300,
  },

  actors: {
    computeAiMove: fromPromise(
      async ({ input }: { input: { state: GameState; engine: AIEngine; seat: PlayerIndex } }) => {
        // This runs on the SERVER (all game machines do). Yield a macrotask
        // first so the session manager can flush its queued `ai-thinking`
        // message before the synchronous ISMCTS search blocks the Node event
        // loop for the whole search budget (hundreds of ms). A worker-thread
        // pool would remove the blocking entirely — see CLAUDE.md.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const strategy = getStrategy(input.engine);
        return runISMCTSWithStats(input.state, input.seat, strategy);
      },
    ),
  },

  guards: {
    isGameOver: ({ context }) => context.gameState.phase === "game-over",
    isAiTurn: ({ context }) => !context.humanPlayers.includes(context.gameState.currentPlayer),
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("lost-cities", () => {
        const gs = createInitialState(event.seed);
        return {
          gameState: gs,
          seed: event.seed,
          aiEngine: event.aiEngine,
          humanPlayers: event.humanPlayers,
          lastAiStats: null,
          pendingAiDraw: null,
          actionLog: [] as ActionLogEntry[],
          replaySteps: [
            {
              turn: 0,
              phase: "play" as const,
              player: gs.currentPlayer,
              state: gameStateToSnapshot(gs),
            },
          ] as ReplayStepV2[],
        };
      });
    }),

    applyPlayerPlay: assign(({ context, event }) => {
      if (event.type !== "PLAY_TO_EXPEDITION" && event.type !== "DISCARD") return {};
      return safeApply("lost-cities", () => {
        const cp = context.gameState.currentPlayer;
        const card = findCard(context.gameState.hands[cp], event.cardId);
        const action: PlayAction =
          event.type === "PLAY_TO_EXPEDITION"
            ? { kind: "expedition", card }
            : { kind: "discard", card };
        const entry: ActionLogEntry = {
          turn: context.gameState.turnCount,
          player: cp,
          action: action.kind === "expedition" ? "play-expedition" : "play-discard",
          card,
        };
        const newGs = applyPlay(context.gameState, action);
        const step: ReplayStepV2 = {
          turn: context.replaySteps.length,
          phase: "play",
          player: cp,
          state: gameStateToSnapshot(newGs),
          action: {
            cardId: card.id,
            kind: action.kind === "expedition" ? 0 : 1,
            ...(action.kind === "discard" ? { color: EXPEDITION_COLORS.indexOf(card.color) } : {}),
          },
        };
        return {
          gameState: newGs,
          actionLog: [...context.actionLog, entry],
          replaySteps: [...context.replaySteps, step],
        };
      });
    }),

    applyPlayerDraw: assign(({ context, event }) =>
      safeApply("lost-cities", () => {
        const gs = context.gameState;
        const cp = gs.currentPlayer;
        const action: DrawAction =
          event.type === "DRAW_FROM_DISCARD"
            ? { kind: "discard-pile", color: event.color }
            : { kind: "draw-pile" };
        const drawnCard =
          action.kind === "draw-pile"
            ? gs.drawPile[gs.drawPile.length - 1]
            : gs.discardPiles[action.color][gs.discardPiles[action.color].length - 1];
        const entry: ActionLogEntry = {
          turn: gs.turnCount,
          player: cp,
          action: action.kind === "draw-pile" ? "draw-pile" : "draw-discard",
          card: drawnCard,
          color: action.kind === "discard-pile" ? action.color : undefined,
        };
        const newGs = applyDraw(gs, action);
        const step: ReplayStepV2 = {
          turn: context.replaySteps.length,
          phase: "draw",
          player: cp,
          state: gameStateToSnapshot(newGs),
          action: {
            cardId: drawnCard.id,
            kind: action.kind === "draw-pile" ? 0 : 1,
            ...(action.kind === "discard-pile"
              ? { color: EXPEDITION_COLORS.indexOf(action.color) }
              : {}),
          },
        };
        return {
          gameState: newGs,
          actionLog: [...context.actionLog, entry],
          replaySteps: [...context.replaySteps, step],
        };
      }),
    ),

    applyAiDraw: assign(({ context }) =>
      safeApply("lost-cities", () => {
        const gs = context.gameState;
        const draw = context.pendingAiDraw;
        if (!draw) throw new Error("applyAiDraw called without pendingAiDraw");
        const hiddenCard: Card = { id: -1, color: "yellow", type: "number", value: 0 };
        const discardCard =
          draw.kind === "discard-pile"
            ? gs.discardPiles[draw.color][gs.discardPiles[draw.color].length - 1]
            : hiddenCard;
        const entry: ActionLogEntry = {
          turn: gs.turnCount,
          player: gs.currentPlayer,
          action: draw.kind === "draw-pile" ? "draw-pile" : "draw-discard",
          card: draw.kind === "draw-pile" ? hiddenCard : discardCard,
          color: draw.kind === "discard-pile" ? draw.color : undefined,
        };
        const drawnCardId =
          draw.kind === "draw-pile"
            ? gs.drawPile[gs.drawPile.length - 1].id
            : gs.discardPiles[draw.color][gs.discardPiles[draw.color].length - 1].id;
        const newGs = applyDraw(gs, draw);
        const drawMcts: MCTSActionStats[] = context.lastAiStats
          ? context.lastAiStats.drawActions.map((a) => ({
              key: a.key,
              kind: a.kind,
              color: a.color,
              visits: a.visits,
              meanNormalizedReward: a.meanNormalizedReward,
              chosen: a.key === context.lastAiStats?.chosenDrawKey,
            }))
          : [];
        const step: ReplayStepV2 = {
          turn: context.replaySteps.length,
          phase: "draw",
          player: gs.currentPlayer,
          state: gameStateToSnapshot(newGs),
          action: {
            cardId: drawnCardId,
            kind: draw.kind === "draw-pile" ? 0 : 1,
            ...(draw.kind === "discard-pile"
              ? { color: EXPEDITION_COLORS.indexOf(draw.color) }
              : {}),
          },
          mcts: { draw: { actions: drawMcts } },
        };
        return {
          gameState: newGs,
          pendingAiDraw: null,
          actionLog: [...context.actionLog, entry],
          replaySteps: [...context.replaySteps, step],
        };
      }),
    ),
  },
}).createMachine({
  id: "lostCities",
  initial: "idle",
  context: () => ({
    gameState: createInitialState(0),
    seed: 0,
    aiEngine: "ismcts-v4" as AIEngine,
    humanPlayers: [0] as number[],
    lastAiStats: null as MCTSStats | null,
    pendingAiDraw: null as DrawAction | null,
    actionLog: [] as ActionLogEntry[],
    replaySteps: [] as ReplayStepV2[],
  }),

  states: {
    idle: {
      on: {
        START: { target: "active", actions: "initGame" },
      },
    },

    active: {
      initial: "routing",
      always: { guard: "isGameOver", target: "#lostCities.gameOver" },

      states: {
        routing: {
          always: [
            { guard: "isAiTurn", target: "aiTurn" },
            {
              guard: ({ context }) => context.gameState.turnPhase === "draw",
              target: "humanDraw",
            },
            { target: "humanPlay" },
          ],
        },

        humanPlay: {
          on: {
            PLAY_TO_EXPEDITION: { target: "humanDraw", actions: "applyPlayerPlay" },
            DISCARD: { target: "humanDraw", actions: "applyPlayerPlay" },
          },
        },

        humanDraw: {
          on: {
            DRAW_FROM_PILE: { target: "routing", actions: "applyPlayerDraw" },
            DRAW_FROM_DISCARD: { target: "routing", actions: "applyPlayerDraw" },
          },
        },

        aiTurn: {
          initial: "computing",
          states: {
            computing: {
              invoke: {
                id: "computeAiMove",
                src: "computeAiMove",
                input: ({ context }) => ({
                  state: context.gameState,
                  engine: context.aiEngine,
                  seat: context.gameState.currentPlayer,
                }),
                onDone: {
                  target: "playApplied",
                  actions: assign(({ context, event }) =>
                    safeApply("lost-cities", () => {
                      const { move, stats } = event.output;
                      const seat = context.gameState.currentPlayer;
                      const entry: ActionLogEntry = {
                        turn: context.gameState.turnCount,
                        player: seat,
                        action:
                          move.play.kind === "expedition" ? "play-expedition" : "play-discard",
                        card: move.play.card,
                      };
                      const newGs = applyPlay(context.gameState, move.play);
                      const playMcts: MCTSActionStats[] = stats.playActions.map((a) => ({
                        key: a.key,
                        cardId: a.cardId,
                        kind: a.kind,
                        visits: a.visits,
                        meanNormalizedReward: a.meanNormalizedReward,
                        chosen: a.key === stats.chosenPlayKey,
                      }));
                      const step: ReplayStepV2 = {
                        turn: context.replaySteps.length,
                        phase: "play",
                        player: seat,
                        state: gameStateToSnapshot(newGs),
                        action: {
                          cardId: move.play.card.id,
                          kind: move.play.kind === "expedition" ? 0 : 1,
                          ...(move.play.kind === "discard"
                            ? { color: EXPEDITION_COLORS.indexOf(move.play.card.color) }
                            : {}),
                        },
                        mcts: { play: { actions: playMcts } },
                      };
                      return {
                        gameState: newGs,
                        lastAiStats: stats,
                        pendingAiDraw: move.draw,
                        actionLog: [...context.actionLog, entry],
                        replaySteps: [...context.replaySteps, step],
                      };
                    }),
                  ),
                },
                // Back off before retrying — straight to `routing` would
                // re-invoke a failing search in a tight loop.
                onError: { target: "retry" },
              },
            },
            playApplied: {
              after: {
                aiStepDelay: { target: "drawApplied", actions: "applyAiDraw" },
              },
            },
            drawApplied: {
              after: {
                aiStepDelay: { target: "#lostCities.active.routing" },
              },
            },
            retry: {
              after: {
                aiStepDelay: { target: "#lostCities.active.routing" },
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

function buildPlayerView(ctx: LostCitiesContext, player: number): LostCitiesPlayerView {
  const gs = ctx.gameState;
  const opp = 1 - player;
  const scores = scoreGame(gs);
  return {
    playerHand: gs.hands[player],
    playerExpeditions: gs.expeditions[player],
    opponentExpeditions: gs.expeditions[opp],
    discardPiles: gs.discardPiles,
    drawPileCount: gs.drawPile.length,
    opponentHandCount: gs.hands[opp].length,
    currentPlayer: (gs.currentPlayer === player ? 0 : 1) as PlayerIndex,
    turnPhase: gs.turnPhase,
    phase: gs.phase,
    turnCount: gs.turnCount,
    playerScore: scores[player],
    opponentScore: scores[opp],
    lastDiscardedColor: gs.lastDiscardedColor,
    actionLog:
      player === 0
        ? ctx.actionLog
        : ctx.actionLog.map((e) => ({
            ...e,
            player: (e.player === player ? 0 : 1) as PlayerIndex,
          })),
  };
}

function buildLegalActions(ctx: LostCitiesContext, player: number): LostCitiesLegalAction[] {
  const gs = ctx.gameState;
  if (player !== gs.currentPlayer) return [];

  if (gs.turnPhase === "play") {
    return getLegalPlays(gs.hands[player], gs.expeditions[player]).map((a) => ({
      phase: "play" as const,
      action: a,
    }));
  }

  return getLegalDraws(gs.discardPiles, gs.drawPile.length, gs.lastDiscardedColor).map((a) => ({
    phase: "draw" as const,
    action: a,
  }));
}

/** The machine event for a validated legal action. */
function toMachineEvent(legal: LostCitiesLegalAction): LostCitiesEvent {
  if (legal.phase === "play") {
    return legal.action.kind === "expedition"
      ? { type: "PLAY_TO_EXPEDITION", cardId: legal.action.card.id }
      : { type: "DISCARD", cardId: legal.action.card.id };
  }
  return legal.action.kind === "draw-pile"
    ? { type: "DRAW_FROM_PILE" }
    : { type: "DRAW_FROM_DISCARD", color: legal.action.color };
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

const toEngine = strategyGuard("Lost Cities", AI_ENGINE_LABELS);

export const lostCitiesSpec: GameMachineSpec<
  typeof lostCitiesMachine,
  LostCitiesPlayerView,
  LostCitiesLegalAction,
  LostCitiesResult
> = {
  machine: lostCitiesMachine,
  manifest: lostCitiesManifest,

  // One AI engine drives every AI seat (there is at most one at two seats).
  buildStart: ({ seats, seed }) => ({
    type: "START",
    aiEngine: toEngine(firstAiStrategy(seats) ?? lostCitiesManifest.defaultStrategy ?? "ismcts-v4"),
    humanPlayers: humanSeats(seats),
    seed,
  }),

  getPlayerView(snapshot, player) {
    return buildPlayerView(snapshot.context, player);
  },

  getLegalActions(snapshot, player) {
    return buildLegalActions(snapshot.context, player);
  },

  validateAction: playerActionValidator<
    typeof lostCitiesMachine,
    LostCitiesLegalAction,
    LostCitiesEvent
  >({
    legalActions: (snapshot, player) => buildLegalActions(snapshot.context, player),
    toEvent: toMachineEvent,
  }),

  getActivePlayer(snapshot) {
    return snapshot.context.gameState.currentPlayer;
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    if (gs.phase !== "game-over") return null;
    const scores = scoreGame(gs);
    const diff = scores[0].total - scores[1].total;
    return {
      scores,
      winner: diff > 0 ? (0 as PlayerIndex) : diff < 0 ? (1 as PlayerIndex) : "draw",
    };
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getOutcome(snapshot) {
    const gs = snapshot.context.gameState;
    return gs.phase === "game-over" ? lostCitiesOutcome(gs) : null;
  },

  getReplayLog(snapshot): LostCitiesReplayLog | null {
    const ctx = snapshot.context;
    if (ctx.gameState.phase !== "game-over") return null;
    const scores = scoreGame(ctx.gameState);
    const seatLabel = (seat: number) => (ctx.humanPlayers.includes(seat) ? "human" : ctx.aiEngine);
    return buildGameLog({
      strategyA: seatLabel(0),
      strategyB: seatLabel(1),
      aPlaysFirst: true,
      steps: ctx.replaySteps,
      scoreA: scores[0].total,
      scoreB: scores[1].total,
    });
  },
};
