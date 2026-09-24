// The server-authoritative Quiztopia machine and its `GameMachineSpec`.
// Modelled on Sky Team: a routing child state mirrors the engine phase, every
// PLAYER_ACTION goes through `safeApply`, and the validator only ever hands
// the engine one of its own enumerated actions.
//
// The question source is captured into context at START, so swapping the
// module-level source (tests, a content reload) never touches a running game.

import { assign, type SnapshotFrom, setup } from "xstate";
import { createRng, randomSeed } from "../../lib/rng.ts";
import { playerActionValidator, safeApply } from "../../machines/action-validation.ts";
import type { GameMachineSpec } from "../../machines/types.ts";
import { applyAction } from "./engine.ts";
import { buildPlayerView } from "./player-view.ts";
import { getQuestionSource, type QuestionSource } from "./question-source.ts";
import { buildReplayLog, toResult } from "./replay-log.ts";
import { getLegalActions } from "./rules.ts";
import { createGame } from "./setup.ts";
import {
  CARDS_PER_GAME,
  type QuiztopiaAction,
  type QuiztopiaGameState,
  type QuiztopiaMachineEvent,
  type QuiztopiaPlayerView,
  type QuiztopiaReplayLog,
  type QuiztopiaResult,
  type QuiztopiaStartConfig,
  QuiztopiaStartConfigSchema,
} from "./types.ts";

export interface QuiztopiaContext {
  gameState: QuiztopiaGameState | null;
  source: QuestionSource | null;
}

function parseStart(event: QuiztopiaMachineEvent): QuiztopiaStartConfig | null {
  if (event.type !== "START") return null;
  const parsed = QuiztopiaStartConfigSchema.safeParse(event);
  return parsed.success ? parsed.data : null;
}

/**
 * START is ignored (the machine stays put) unless the config parses AND the
 * installed source can deal a full game — so a smuggled `playerCount: 9999`
 * or a server without content never builds a state.
 */
function isValidStart(event: QuiztopiaMachineEvent): boolean {
  const config = parseStart(event);
  if (!config) return false;
  return getQuestionSource().listCardRefs(config.deck).length >= CARDS_PER_GAME;
}

export const quiztopiaMachine = setup({
  types: {} as {
    context: QuiztopiaContext;
    events: QuiztopiaMachineEvent;
  },

  guards: {
    validStart: ({ event }) => isValidStart(event),
    isGameOver: ({ context }) => context.gameState?.outcome != null,
    inChooseBuilding: ({ context }) => context.gameState?.phase === "choose-building",
    inQuestion: ({ context }) => context.gameState?.phase === "question",
    inJudge: ({ context }) => context.gameState?.phase === "judge",
    inBakeryOffer: ({ context }) => context.gameState?.phase === "bakery-offer",
    inLossPending: ({ context }) => context.gameState?.phase === "loss-pending",
  },

  actions: {
    initGame: assign(({ event }) => {
      const config = parseStart(event);
      if (!config) return {};
      return safeApply("quiztopia", () => {
        const source = getQuestionSource();
        const seed = config.seed ?? randomSeed();
        const gameState = createGame({ ...config, seed }, { rng: createRng(seed), source });
        return { gameState, source };
      });
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      const gs = context.gameState;
      const source = context.source;
      if (!gs || !source) return {};
      return safeApply("quiztopia", () => ({
        gameState: applyAction(gs, event.player, event.action, { source }),
      }));
    }),

    clearGame: assign(() => ({ gameState: null, source: null })),
  },
}).createMachine({
  id: "quiztopia",
  initial: "idle",
  context: { gameState: null, source: null },

  states: {
    idle: {
      on: { START: { guard: "validStart", target: "active", actions: "initGame" } },
    },

    active: {
      initial: "routing",

      states: {
        routing: {
          always: [
            { guard: "isGameOver", target: "#quiztopia.gameOver" },
            { guard: "inChooseBuilding", target: "chooseBuilding" },
            { guard: "inQuestion", target: "question" },
            { guard: "inJudge", target: "judge" },
            { guard: "inBakeryOffer", target: "bakeryOffer" },
            { guard: "inLossPending", target: "lossPending" },
          ],
        },
        chooseBuilding: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },
        question: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },
        judge: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },
        bakeryOffer: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },
        lossPending: {
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" } },
        },
      },

      on: {
        // A restart re-enters `active` so routing lands on the new state's phase.
        START: { guard: "validStart", target: "active", reenter: true, actions: "initGame" },
        RESET: { target: "idle", actions: "clearGame" },
      },
    },

    gameOver: {
      on: {
        START: { guard: "validStart", target: "active", actions: "initGame" },
        RESET: { target: "idle", actions: "clearGame" },
      },
    },
  },
});

type QuiztopiaSnapshot = SnapshotFrom<typeof quiztopiaMachine>;

function legalActionsFor(snapshot: QuiztopiaSnapshot, player: number): QuiztopiaAction[] {
  const gs = snapshot.context.gameState;
  return gs ? getLegalActions(gs, player) : [];
}

export const quiztopiaSpec: GameMachineSpec<
  typeof quiztopiaMachine,
  QuiztopiaPlayerView,
  QuiztopiaAction,
  QuiztopiaResult
> = {
  machine: quiztopiaMachine,

  getPlayerView(snapshot, player) {
    const gs = snapshot.context.gameState;
    if (!gs) throw new Error("quiztopiaSpec.getPlayerView called before game started");
    return buildPlayerView(gs, player);
  },

  getLegalActions(snapshot, player) {
    return legalActionsFor(snapshot, player);
  },

  validateAction: playerActionValidator<
    typeof quiztopiaMachine,
    QuiztopiaAction,
    QuiztopiaMachineEvent
  >({
    legalActions: legalActionsFor,
    toEvent: (action, player) => ({ type: "PLAYER_ACTION", player, action }),
  }),

  // -1 in every playing state: help cards, tip flips and penalties are
  // any-seat actions the server's turn check would otherwise block. Per-seat
  // legality lives in `getLegalActions`.
  getActivePlayer(snapshot) {
    return snapshot.context.gameState ? -1 : 0;
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    if (!gs || gs.outcome === null) return null;
    return toResult(gs);
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getReplayLog(snapshot): QuiztopiaReplayLog | null {
    const gs = snapshot.context.gameState;
    if (!gs || gs.outcome === null) return null;
    return buildReplayLog(gs);
  },
};
