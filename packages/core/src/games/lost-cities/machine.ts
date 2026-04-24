import { assign, fromPromise, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import { getStrategy } from "./ai-strategies";
import { applyDraw, applyPlay, createInitialState } from "./game-engine";
import type { MCTSStats } from "./mcts/ismcts";
import { runISMCTSWithStats } from "./mcts/ismcts";
import { getLegalDraws, getLegalPlays } from "./rules";
import { scoreGame } from "./scoring";
import type { MCTSActionStats, ReplayStepV2, TournamentGameLog } from "./tournament-log";
import { buildGameLog, gameStateToSnapshot } from "./tournament-log";
import type {
  ActionLogEntry,
  AIEngine,
  Card,
  DrawAction,
  ExpeditionColor,
  GameState,
  PlayAction,
  PlayerIndex,
  PlayerScore,
} from "./types";
import { EXPEDITION_COLORS } from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface LostCitiesContext {
  gameState: GameState;
  aiEngine: AIEngine;
  humanPlayers: number[];
  lastAiStats: MCTSStats | null;
  pendingAiDraw: DrawAction | null;
  actionLog: ActionLogEntry[];
  replaySteps: ReplayStepV2[];
}

export type LostCitiesEvent =
  | { type: "START"; aiEngine: AIEngine; humanPlayers?: number[] }
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
  phase: string;
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
      async ({ input }: { input: { state: GameState; engine: AIEngine } }) => {
        // Yield a macrotask so React paints the human's last action before MCTS
        // blocks the main thread. Without this the UI sits on the pre-action
        // state for the entire MCTS budget (hundreds of ms).
        await new Promise((resolve) => setTimeout(resolve, 0));
        const strategy = getStrategy(input.engine);
        return runISMCTSWithStats(input.state, 1, strategy);
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
      const gs = createInitialState();
      return {
        gameState: gs,
        aiEngine: event.aiEngine,
        humanPlayers: event.humanPlayers ?? [0],
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
    }),

    applyPlayerPlay: assign(({ context, event }) => {
      if (event.type !== "PLAY_TO_EXPEDITION" && event.type !== "DISCARD") return {};
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
    }),

    applyPlayerDraw: assign(({ context, event }) => {
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

    applyAiDraw: assign(({ context }) => {
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
        player: 1,
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
        player: 1,
        state: gameStateToSnapshot(newGs),
        action: {
          cardId: drawnCardId,
          kind: draw.kind === "draw-pile" ? 0 : 1,
          ...(draw.kind === "discard-pile" ? { color: EXPEDITION_COLORS.indexOf(draw.color) } : {}),
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
  },
}).createMachine({
  id: "lostCities",
  initial: "idle",
  context: () => ({
    gameState: createInitialState(),
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
                }),
                onDone: {
                  target: "playApplied",
                  actions: assign(({ context, event }) => {
                    const { move, stats } = event.output;
                    const entry: ActionLogEntry = {
                      turn: context.gameState.turnCount,
                      player: 1,
                      action: move.play.kind === "expedition" ? "play-expedition" : "play-discard",
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
                      player: 1,
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
                },
                onError: { target: "#lostCities.active.routing" },
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

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const lostCitiesSpec: GameMachineSpec<
  typeof lostCitiesMachine,
  LostCitiesPlayerView,
  LostCitiesLegalAction,
  LostCitiesResult
> = {
  machine: lostCitiesMachine,

  getPlayerView(snapshot, player) {
    return buildPlayerView(snapshot.context, player);
  },

  getLegalActions(snapshot, player) {
    return buildLegalActions(snapshot.context, player);
  },

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

  getReplayLog(snapshot): TournamentGameLog | null {
    const ctx = snapshot.context;
    if (ctx.gameState.phase !== "game-over") return null;
    const scores = scoreGame(ctx.gameState);
    return buildGameLog({
      strategyA: "human",
      strategyB: ctx.aiEngine,
      aPlaysFirst: true,
      steps: ctx.replaySteps,
      scoreA: scores[0].total,
      scoreB: scores[1].total,
    });
  },
};
