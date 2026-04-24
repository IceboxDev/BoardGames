import { assign, fromPromise, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import { getAILegalActions, getStrategy } from "./ai-strategies";
import { applyActionPure, createInitialState } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import { scorePlayer } from "./scoring";
import type {
  Action,
  AIStrategyId,
  GameState,
  ParksPlayerView,
  ParksResult,
  ScoreBreakdown,
} from "./types";

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface ParksContext {
  gameState: GameState;
}

export type ParksEvent =
  | { type: "START"; strategies: (AIStrategyId | null)[] }
  | { type: "PLAYER_ACTION"; action: Action }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAiTurn(gs: GameState): boolean {
  if (gs.phase === "game-over") return false;
  const active = gs.players[gs.activePlayer];
  return !!active && active.type === "ai";
}

function computeAiAction(gs: GameState): Action {
  const active = gs.players[gs.activePlayer];
  const strategyId = active.aiStrategy ?? "random";
  const strategy = getStrategy(strategyId);
  const legal = getAILegalActions(gs);
  if (legal.length === 0) throw new Error("No legal actions for AI");
  return strategy.pickAction(gs, legal, gs.activePlayer);
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const PLACEHOLDER = null as unknown as GameState;

export const parksMachine = setup({
  types: {} as {
    context: ParksContext;
    events: ParksEvent;
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
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return { gameState: createInitialState(event.strategies) };
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
  id: "parks",
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
            { guard: "isGameOver", target: "#parks.gameOver" },
            { guard: "isAiTurn", target: "aiComputing" },
            { target: "humanTurn" },
          ],
        },

        humanTurn: {
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
// Player view projection (Parks is open information; just hand back state)
// ---------------------------------------------------------------------------

function buildPlayerView(ctx: ParksContext, _player: number): ParksPlayerView {
  const gs = ctx.gameState;
  return {
    phase: gs.phase,
    season: gs.season,
    trail: gs.trail,
    weatherTokens: gs.weatherTokens,
    activePlayer: gs.activePlayer,
    parksDisplay: gs.parksDisplay,
    parksDeckCount: gs.parksDeck.length,
    canteenPoolCount: gs.canteenPool.length,
    canteenDisplay: gs.canteenDisplay,
    gearMarketVisible: gs.gearMarket.visible,
    gearDeckCount: gs.gearMarket.deck.length + gs.gearMarket.discard.length,
    pendingSiteContext: gs.pendingSiteContext,
    pendingGearActivation: gs.pendingGearActivation,
    pendingLanding: gs.pendingLanding,
    pendingWaterPlacements: gs.pendingWaterPlacements,
    pendingCanteenEffect: gs.pendingCanteenEffect,
    players: gs.players.map((p) => ({
      index: p.index,
      type: p.type,
      aiStrategy: p.aiStrategy,
      hikers: p.hikers,
      resources: p.resources,
      canteens: p.canteens,
      waterTokens: p.waterTokens,
      photoCount: p.photos.length,
      parks: p.parks,
      gear: p.gear,
      reservedParks: p.reservedParks,
      campfireLit: p.campfireLit,
      triggeredThisTurn: p.triggeredThisTurn,
      usedGearThisTurn: p.usedGearThisTurn,
      passion: p.passion,
      passionOptions: p.passionOptions,
      passionGoalMet: p.passionGoalMet,
      passionMode: p.passionMode,
      canteensUsedCount: p.canteensUsedCount,
      seasonStats: p.seasonStats,
      bonusPT: p.bonusPT,
      doneForSeason: p.doneForSeason,
    })),
    shutterbugTilePosition: gs.shutterbugTilePosition,
    shutterbugHolder: gs.shutterbugHolder,
    firstPlayerToken: gs.firstPlayerToken,
    trailEndRowFirstOccupier: gs.trailEndRowFirstOccupier,
    selectedSeasonMissions: gs.selectedSeasonMissions,
    seasonMissionResults: gs.seasonMissionResults,
    actionLog: gs.actionLog,
    turnCount: gs.turnCount,
  };
}

function computeResult(gs: GameState): ParksResult | null {
  if (gs.phase !== "game-over") return null;
  const breakdowns: ScoreBreakdown[] = gs.players.map((p) => scorePlayer(p));
  const scores = breakdowns.map((b) => b.total);
  const max = Math.max(...scores);
  const tied = scores.filter((s) => s === max).length > 1;
  // Tiebreak: most parks visited
  let winner = scores.indexOf(max);
  if (tied) {
    let bestParks = -1;
    for (let i = 0; i < gs.players.length; i++) {
      if (scores[i] === max && gs.players[i].parks.length > bestParks) {
        bestParks = gs.players[i].parks.length;
        winner = i;
      }
    }
  }
  const isDraw =
    tied &&
    gs.players
      .filter((_, i) => scores[i] === max)
      .every((p) => p.parks.length === gs.players[winner].parks.length);
  return { scores, breakdowns, winner, isDraw };
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const parksSpec: GameMachineSpec<typeof parksMachine, ParksPlayerView, Action, ParksResult> =
  {
    machine: parksMachine,

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
      return computeResult(snapshot.context.gameState);
    },

    isGameOver(snapshot) {
      return snapshot.matches("gameOver");
    },
  };
