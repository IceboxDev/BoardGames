/**
 * Classical chess as a server-run XState machine.
 *
 *   idle → active { routing → humanTurn | aiTurn } → gameOver
 *
 * Every rule is in `game.ts`; this file routes events, runs the AI and keeps
 * time. The clock's flag fall is a delayed transition re-armed each time a
 * turn state is entered, with the delay read from the clock itself. Meta
 * actions (resign, draw offers, takebacks, claims) are taken in any active
 * state, including while the AI thinks — out of turn, which is why the spec
 * `acceptsOffTurn` everything but a move and lets `getLegalActions` decide.
 */

import { assign, enqueueActions, fromPromise, type SnapshotFrom, setup } from "xstate";
import { z } from "zod";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import { rankedByWinners } from "../../machines/outcome";
import { seatStrategies } from "../../machines/seats";
import type { GameMachineSpec } from "../../machines/types";
import {
  BUILT_IN_STRATEGIES,
  builtInAgent,
  builtInMove,
  type ChessAgent,
  type ChessAgentRequest,
} from "./agent";
import { clockView, msUntilFlag } from "./clock";
import { opposite } from "./engine/board";
import { toFen } from "./engine/fen";
import type { Color } from "./engine/types";
import { evalFor } from "./fallback-ai";
import {
  type ChessGame,
  canOfferDraw,
  canRequestTakeback,
  claimableDraw,
  clockAt,
  createGame,
  declineDraw,
  declineTakeback,
  drawBy,
  flagGame,
  hasOwnMove,
  isFlagged,
  legalUcis,
  offerDraw,
  playMove,
  requestTakeback,
  resign,
  takeBack,
  winByAbandon,
} from "./game";
import { type ChessConfig, chessManifest } from "./manifest";
import type { ChessAction, ChessPlayerView, ChessReplayLog, ChessResult } from "./schemas";

/** How long a player may be gone before the opponent can claim the game. */
export const ABANDON_MS = 60_000;
/** Above this, `setTimeout` overflows and fires at once — an untimed game waits this long. */
const MAX_TIMER_MS = 2_000_000_000;
/** Fire just after the flag, so the "has it fallen?" check never runs early. */
const FLAG_SLACK_MS = 25;
/** An AI is offered a draw: it takes one only when its static eval is at least this bad. */
const AI_ACCEPTS_DRAW_AT = -200;

/** Just enough of the envelope to tell a move from an off-turn action. */
const PlayerActionShape = z.object({ action: z.object({ kind: z.string() }) });

export const seatColor = (seat: number): Color => (seat === 0 ? "w" : "b");
export const colorSeat = (color: Color): number => (color === "w" ? 0 : 1);

// ---------------------------------------------------------------------------
// Context & events
// ---------------------------------------------------------------------------

export interface ChessContext {
  game: ChessGame | null;
  seed: number;
  /** Per seat: the AI's strategy id, or `null` for a person. Seat 0 is White. */
  strategies: (string | null)[];
  config: ChessConfig;
  /** Seats whose connection is down (rooms; the server reports it). */
  disconnected: number[];
  /** Seats gone for `ABANDON_MS` — their opponent may claim the game. */
  abandoned: number[];
}

export type ChessEvent =
  | {
      type: "START";
      strategies: (string | null)[];
      config: ChessConfig;
      seed: number;
    }
  | { type: "PLAYER_ACTION"; action: ChessAction; player: number }
  | { type: "SEAT_CONNECTION"; seat: number; connected: boolean }
  | { type: "ABANDON_READY"; seat: number }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isAiSeat = (ctx: ChessContext, seat: number): boolean => ctx.strategies[seat] != null;

function aiRequest(ctx: ChessContext, game: ChessGame): ChessAgentRequest {
  const seat = colorSeat(game.position.turn);
  return {
    variant: "chess",
    startFen: game.startFen,
    moves: game.history.map((h) => h.uci),
    fen: toFen(game.position),
    strategy: ctx.strategies[seat] ?? "random",
    clock: clockAt(game, Date.now()),
    seed: ctx.seed,
  };
}

/** Apply one validated human action. Everything is legal by construction. */
function applyAction(ctx: ChessContext, action: ChessAction, seat: number): ChessGame | null {
  const game = ctx.game;
  if (!game) return game;
  const now = Date.now();
  const color = seatColor(seat);
  const opponentIsAi = isAiSeat(ctx, 1 - seat);
  switch (action.kind) {
    case "move":
      return playMove(game, action.uci, now).game;
    case "resign":
      return resign(game, color, now);
    case "offer-draw": {
      const offered = offerDraw(game, color);
      if (!opponentIsAi) return offered;
      // The AI answers at once: a draw is welcome only when it's losing.
      const aiColor = opposite(color);
      return evalFor(game.position, aiColor) <= AI_ACCEPTS_DRAW_AT
        ? drawBy(offered, "agreement", now)
        : declineDraw(offered);
    }
    case "accept-draw":
      return drawBy(game, "agreement", now);
    case "decline-draw":
      return declineDraw(game);
    case "claim-draw":
      return drawBy(game, action.reason, now);
    case "claim-win":
      return winByAbandon(game, color, now);
    case "takeback":
      return takeBack(game, color, now);
    case "request-takeback":
      return requestTakeback(game, color);
    case "accept-takeback":
      // The requester's last move (and anything after it) comes off.
      return takeBack(game, opposite(color), now);
    case "decline-takeback":
      return declineTakeback(game);
  }
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const chessMachine = setup({
  types: {} as { context: ChessContext; events: ChessEvent },

  delays: {
    clockDeadline: ({ context }) => {
      const clock = context.game?.clock;
      if (!clock) return MAX_TIMER_MS;
      return Math.min(MAX_TIMER_MS, msUntilFlag(clock, Date.now()) + FLAG_SLACK_MS);
    },
    aiRetry: 500,
  },

  actors: {
    computeAiMove: fromPromise(async ({ input }: { input: ChessAgentRequest }) => {
      // Yield first so the "AI is thinking" frame goes out before the search.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return builtInAgent.bestMove(input);
    }),
  },

  guards: {
    isOver: ({ context }) => !!context.game?.result,
    isAiTurn: ({ context }) =>
      !!context.game && isAiSeat(context, colorSeat(context.game.position.turn)),
    isFlagged: ({ context }) => !!context.game && isFlagged(context.game, Date.now()),
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("chess", () => ({
        game: createGame({ timeControl: event.config.timeControl, now: Date.now() }),
        seed: event.seed,
        strategies: event.strategies,
        config: event.config,
        disconnected: [],
        abandoned: [],
      }));
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      return safeApply("chess", () => ({
        game: applyAction(context, event.action, event.player),
      }));
    }),

    applyAiMove: assign(({ context, event }) => {
      const game = context.game;
      if (!game) return {};
      const proposed = (event as unknown as { output: string }).output;
      return safeApply("chess", () => {
        // Never trust an engine's word: an illegal reply plays the built-in move.
        const uci = legalUcis(game).includes(proposed)
          ? proposed
          : builtInMove(aiRequest(context, game));
        return { game: playMove(game, uci, Date.now()).game };
      });
    }),

    flag: assign(({ context }) =>
      context.game ? { game: flagGame(context.game, Date.now()) } : {},
    ),

    trackConnection: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "SEAT_CONNECTION") return;
      const id = `abandon-${event.seat}`;
      const others = context.disconnected.filter((s) => s !== event.seat);
      if (event.connected) {
        enqueue.cancel(id);
        enqueue.assign({
          disconnected: others,
          abandoned: context.abandoned.filter((s) => s !== event.seat),
        });
      } else {
        enqueue.assign({ disconnected: [...others, event.seat] });
        enqueue.raise({ type: "ABANDON_READY", seat: event.seat }, { id, delay: ABANDON_MS });
      }
    }),

    markAbandoned: assign(({ context, event }) => {
      if (event.type !== "ABANDON_READY") return {};
      if (!context.disconnected.includes(event.seat)) return {};
      if (context.abandoned.includes(event.seat)) return {};
      return { abandoned: [...context.abandoned, event.seat] };
    }),
  },
}).createMachine({
  id: "chess",
  initial: "idle",
  context: {
    game: null,
    seed: 0,
    strategies: [],
    config: { timeControl: null, takebacks: true },
    disconnected: [],
    abandoned: [],
  },

  states: {
    idle: {
      on: { START: { target: "active", actions: "initGame" } },
    },

    active: {
      initial: "routing",
      always: { guard: "isOver", target: "gameOver" },

      states: {
        routing: {
          always: [
            { guard: "isOver", target: "#chess.gameOver" },
            { guard: "isAiTurn", target: "aiTurn" },
            { target: "humanTurn" },
          ],
        },

        humanTurn: {
          after: {
            clockDeadline: [
              { guard: "isFlagged", target: "routing", actions: "flag" },
              // Woke a hair early (or an untimed game's far-off check): re-arm.
              { target: "routing" },
            ],
          },
        },

        aiTurn: {
          invoke: {
            src: "computeAiMove",
            input: ({ context }) => aiRequest(context, context.game as ChessGame),
            onDone: { target: "routing", actions: "applyAiMove" },
            onError: { target: "aiRetry" },
          },
          after: {
            clockDeadline: [
              { guard: "isFlagged", target: "routing", actions: "flag" },
              { target: "aiTurn", reenter: true },
            ],
          },
        },

        // Back off before asking again — straight to routing would spin on a broken agent.
        aiRetry: {
          after: { aiRetry: "routing" },
        },
      },

      on: {
        PLAYER_ACTION: [
          {
            // A position change (or game end) re-routes; leaving `aiTurn`
            // cancels a search that a takeback just made stale.
            guard: ({ event }) => changesPosition(event.action),
            target: ".routing",
            actions: "applyPlayerAction",
          },
          { actions: "applyPlayerAction" },
        ],
        SEAT_CONNECTION: { actions: "trackConnection" },
        ABANDON_READY: { actions: "markAbandoned" },
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

/** Moves, takebacks and anything that can end the game change whose turn it is. */
function changesPosition(action: ChessAction): boolean {
  switch (action.kind) {
    case "offer-draw":
    case "decline-draw":
    case "request-takeback":
    case "decline-takeback":
      return false;
    default:
      return true;
  }
}

/** Bind an external engine (Stockfish) for this machine's AI seats. */
export function withChessAgent(agent: ChessAgent) {
  return chessMachine.provide({
    actors: {
      computeAiMove: fromPromise(async ({ input }: { input: ChessAgentRequest }) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (BUILT_IN_STRATEGIES.has(input.strategy)) return builtInMove(input);
        try {
          return await agent.bestMove(input);
        } catch (err) {
          console.warn("[chess] engine failed, playing the built-in move:", err);
          return builtInMove(input);
        }
      }),
    },
  });
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

type ChessSnapshot = SnapshotFrom<typeof chessMachine>;

function legalActionsFor(snapshot: ChessSnapshot, seat: number): ChessAction[] {
  const ctx = snapshot.context;
  const game = ctx.game;
  if (!game || game.result || seat < 0 || seat > 1 || isAiSeat(ctx, seat)) return [];
  if (!snapshot.matches("active")) return [];

  const color = seatColor(seat);
  const them = opposite(color);
  const opponentIsAi = isAiSeat(ctx, 1 - seat);
  const actions: ChessAction[] = [];

  if (game.position.turn === color) {
    for (const uci of legalUcis(game)) actions.push({ kind: "move", uci });
  }
  actions.push({ kind: "resign" });

  if (game.drawOffer === them) {
    actions.push({ kind: "accept-draw" }, { kind: "decline-draw" });
  } else if (canOfferDraw(game, color)) {
    actions.push({ kind: "offer-draw" });
  }

  const claim = claimableDraw(game);
  if (claim && game.position.turn === color) actions.push({ kind: "claim-draw", reason: claim });

  if (ctx.config.takebacks) {
    if (opponentIsAi) {
      if (hasOwnMove(game, color)) actions.push({ kind: "takeback" });
    } else if (game.takebackRequest === them) {
      actions.push({ kind: "accept-takeback" }, { kind: "decline-takeback" });
    } else if (canRequestTakeback(game, color)) {
      actions.push({ kind: "request-takeback" });
    }
  }

  if (ctx.abandoned.includes(1 - seat)) {
    actions.push({ kind: "claim-win" }, { kind: "claim-draw", reason: "abandon" });
  }
  return actions;
}

function buildView(snapshot: ChessSnapshot, seat: number): ChessPlayerView {
  const ctx = snapshot.context;
  const game = ctx.game;
  const now = Date.now();
  const aiSeats = ctx.strategies.flatMap((s, i) => (s != null ? [i] : []));
  return {
    fen: game ? toFen(game.position) : "",
    startFen: game?.startFen ?? "",
    color: seat === 0 || seat === 1 ? seatColor(seat) : null,
    seatColors: ["w", "b"],
    aiSeats,
    history: game ? [...game.history] : [],
    clock: game?.clock ? clockView(game.clock, now) : null,
    drawOffer: game?.drawOffer ?? null,
    takebackRequest: game?.takebackRequest ?? null,
    claimableDraw: game ? claimableDraw(game) : null,
    disconnected: [...ctx.disconnected],
    abandoned: [...ctx.abandoned],
    aiThinking: snapshot.matches({ active: "aiTurn" }),
    result: game?.result ?? null,
    timeControl: game?.timeControl ?? null,
  };
}

export function chessOutcome(result: ChessResult) {
  return rankedByWinners(2, result.winner ? [colorSeat(result.winner)] : []);
}

export const chessSpec: GameMachineSpec<
  typeof chessMachine,
  ChessPlayerView,
  ChessAction,
  ChessResult,
  ChessConfig
> = {
  machine: chessMachine,
  manifest: chessManifest,

  buildStart: ({ seats, config, seed }) => ({
    type: "START",
    strategies: seatStrategies(seats),
    config,
    seed,
  }),

  getPlayerView: buildView,
  getLegalActions: legalActionsFor,

  validateAction: playerActionValidator({
    legalActions: legalActionsFor,
    toEvent: (action, player) => ({ type: "PLAYER_ACTION", action, player }) as const,
  }),

  getActivePlayer(snapshot) {
    const game = snapshot.context.game;
    if (!game || game.result) return -1;
    return colorSeat(game.position.turn);
  },

  // Resigning, offering a draw and answering one happen out of turn; only a
  // move needs it to be your turn (and `validateAction` checks that too).
  acceptsOffTurn: (_snapshot, _player, raw) => {
    const parsed = PlayerActionShape.safeParse(raw);
    return parsed.success && parsed.data.action.kind !== "move";
  },

  getResult(snapshot) {
    return snapshot.context.game?.result ?? null;
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getOutcome(snapshot) {
    const result = snapshot.context.game?.result;
    return result ? chessOutcome(result) : null;
  },

  getReplayLog(snapshot): ChessReplayLog | null {
    const { game, strategies } = snapshot.context;
    if (!game?.result) return null;
    return {
      formatVersion: 1,
      variant: "chess",
      startFen: game.startFen,
      timeControl: game.timeControl,
      strategies,
      moves: [...game.history],
      result: game.result,
    };
  },
};
