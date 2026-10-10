/**
 * Bughouse as a server-run XState machine: both boards play at once.
 *
 *   idle → active (parallel) { boardA: routing → humanTurn | aiTurn,
 *                              boardB: routing → humanTurn | aiTurn } → gameOver
 *
 * Each board's region owns its moves, its flag-fall timer and its AI search,
 * so a move on board A never interrupts board B's AI. The regions share one
 * context (`BughouseGame`): a capture on one board lands in a pocket on the
 * other at once. An AI's search can't be invalidated by that — pockets only
 * grow while it thinks, so its move is still legal (and is re-checked anyway).
 */

import { assign, enqueueActions, fromPromise, type SnapshotFrom, setup } from "xstate";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import { seatStrategies } from "../../machines/seats";
import type { GameMachineSpec } from "../../machines/types";
import {
  BUILT_IN_STRATEGIES,
  builtInAgent,
  builtInMove,
  type ChessAgent,
  type ChessAgentRequest,
} from "../chess/agent";
import { clockView, msUntilFlag } from "../chess/clock";
import { toFen } from "../chess/engine/fen";
import { clockAt } from "../chess/game";
import { ABANDON_MS } from "../chess/machine";
import {
  abandonSeat,
  type BoardIndex,
  type BughouseGame,
  boardFlagged,
  boardOf,
  colorOf,
  createBughouse,
  flagBoard,
  partnerOf,
  playBughouseMove,
  resignSeat,
  seatAt,
  seatMoves,
  sendSignal,
  TEAM_OF,
  teamOf,
} from "./game";
import { type BughouseConfig, bughouseManifest } from "./manifest";
import {
  type BughouseAction,
  type BughousePlayerView,
  type BughouseReplayLog,
  type BughouseResult,
  SIGNAL_CODES,
} from "./schemas";

const MAX_TIMER_MS = 2_000_000_000;
const FLAG_SLACK_MS = 25;
/** A bot waits this long before each move, so the boards stay watchable. */
const AI_PACE_MS = 300;

export interface BughouseContext {
  game: BughouseGame | null;
  seed: number;
  strategies: (string | null)[];
  config: BughouseConfig;
  disconnected: number[];
  abandoned: number[];
}

export type BughouseEvent =
  | { type: "START"; strategies: (string | null)[]; config: BughouseConfig; seed: number }
  | { type: "PLAYER_ACTION"; action: BughouseAction; player: number }
  | { type: "SEAT_CONNECTION"; seat: number; connected: boolean }
  | { type: "ABANDON_READY"; seat: number }
  | { type: "RESET" };

const isAiSeat = (ctx: BughouseContext, seat: number) => ctx.strategies[seat] != null;

function aiRequest(ctx: BughouseContext, board: BoardIndex): ChessAgentRequest {
  const game = ctx.game as BughouseGame;
  const b = game.boards[board];
  const seat = seatAt(board, b.position.turn);
  const fen = toFen(b.position);
  return {
    variant: "bughouse",
    startFen: fen,
    moves: [],
    fen,
    strategy: ctx.strategies[seat] ?? "random",
    clock: clockAt(b, Date.now()),
    seed: (ctx.seed ^ ((board + 1) * 0x45d9f3b)) | 0,
  };
}

const aiToMove = (ctx: BughouseContext, board: BoardIndex) =>
  !!ctx.game &&
  !ctx.game.result &&
  isAiSeat(ctx, seatAt(board, ctx.game.boards[board].position.turn));

const deadline = (ctx: BughouseContext, board: BoardIndex) => {
  const clock = ctx.game?.boards[board].clock;
  if (!clock) return MAX_TIMER_MS;
  return Math.min(MAX_TIMER_MS, msUntilFlag(clock, Date.now()) + FLAG_SLACK_MS);
};

/** One board's region; the two differ only in the board index. */
function boardRegion(board: BoardIndex) {
  const deadlineDelay = board === 0 ? "deadlineA" : "deadlineB";
  return {
    initial: "routing",
    states: {
      routing: {
        always: [
          { guard: board === 0 ? "aiOnA" : "aiOnB", target: "aiTurn" },
          { target: "humanTurn" },
        ],
      },
      humanTurn: {
        on: {
          PLAYER_ACTION: {
            guard: board === 0 ? "moveOnA" : "moveOnB",
            target: "routing",
            actions: "applyPlayerAction",
          },
        },
        after: {
          [deadlineDelay]: [
            {
              guard: board === 0 ? "flaggedA" : "flaggedB",
              target: "routing",
              actions: board === 0 ? "flagA" : "flagB",
            },
            { target: "routing" },
          ],
        },
      },
      aiTurn: {
        initial: "pacing",
        states: {
          pacing: { after: { aiPace: "thinking" } },
          thinking: {
            invoke: {
              src: "computeAiMove",
              input: ({ context }: { context: BughouseContext }) => aiRequest(context, board),
              onDone: {
                target: `#bughouse.active.${board === 0 ? "boardA" : "boardB"}.routing`,
                actions: board === 0 ? "applyAiA" : "applyAiB",
              },
              onError: { target: "pacing" },
            },
          },
        },
        after: {
          [deadlineDelay]: [
            {
              guard: board === 0 ? "flaggedA" : "flaggedB",
              target: "routing",
              actions: board === 0 ? "flagA" : "flagB",
            },
            { target: "aiTurn", reenter: true },
          ],
        },
      },
    },
  } as const;
}

function applyAi(
  ctx: BughouseContext,
  board: BoardIndex,
  proposed: string,
): Partial<BughouseContext> {
  const game = ctx.game;
  if (!game) return {};
  const seat = seatAt(board, game.boards[board].position.turn);
  return safeApply("chess-bughouse", () => {
    const legal = seatMoves(game, seat);
    if (legal.length === 0) return {}; // stuck (no move, not mated): it waits for a piece
    const uci = legal.includes(proposed) ? proposed : builtInMove(aiRequest(ctx, board));
    return { game: playBughouseMove(game, seat, uci, Date.now()) };
  });
}

export const bughouseMachine = setup({
  types: {} as { context: BughouseContext; events: BughouseEvent },
  delays: {
    deadlineA: ({ context }) => deadline(context, 0),
    deadlineB: ({ context }) => deadline(context, 1),
    aiPace: AI_PACE_MS,
  },
  actors: {
    computeAiMove: fromPromise(async ({ input }: { input: ChessAgentRequest }) =>
      builtInAgent.bestMove(input),
    ),
  },
  guards: {
    isOver: ({ context }) => !!context.game?.result,
    aiOnA: ({ context }) => aiToMove(context, 0),
    aiOnB: ({ context }) => aiToMove(context, 1),
    flaggedA: ({ context }) => !!context.game && boardFlagged(context.game, 0, Date.now()),
    flaggedB: ({ context }) => !!context.game && boardFlagged(context.game, 1, Date.now()),
    moveOnA: ({ event }) =>
      event.type === "PLAYER_ACTION" && event.action.kind === "move" && boardOf(event.player) === 0,
    moveOnB: ({ event }) =>
      event.type === "PLAYER_ACTION" && event.action.kind === "move" && boardOf(event.player) === 1,
    isMeta: ({ event }) => event.type === "PLAYER_ACTION" && event.action.kind !== "move",
  },
  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("chess-bughouse", () => ({
        game: createBughouse(event.config.timeControl, Date.now()),
        seed: event.seed,
        strategies: event.strategies,
        config: event.config,
        disconnected: [],
        abandoned: [],
      }));
    }),
    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION" || !context.game) return {};
      const game = context.game;
      const { action, player } = event;
      const now = Date.now();
      return safeApply("chess-bughouse", () => {
        switch (action.kind) {
          case "move":
            return { game: playBughouseMove(game, player, action.uci, now) };
          case "resign":
            return { game: resignSeat(game, player, now) };
          case "signal":
            return { game: sendSignal(game, player, action.code, now) };
          case "claim-win": {
            const gone = context.abandoned.find((s) => teamOf(s) !== teamOf(player));
            return gone === undefined ? {} : { game: abandonSeat(game, gone, now) };
          }
        }
      });
    }),
    applyAiA: assign(({ context, event }) =>
      applyAi(context, 0, (event as unknown as { output: string }).output),
    ),
    applyAiB: assign(({ context, event }) =>
      applyAi(context, 1, (event as unknown as { output: string }).output),
    ),
    flagA: assign(({ context }) =>
      context.game ? { game: flagBoard(context.game, 0, Date.now()) } : {},
    ),
    flagB: assign(({ context }) =>
      context.game ? { game: flagBoard(context.game, 1, Date.now()) } : {},
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
      if (!context.disconnected.includes(event.seat) || context.abandoned.includes(event.seat))
        return {};
      return { abandoned: [...context.abandoned, event.seat] };
    }),
  },
}).createMachine({
  id: "bughouse",
  initial: "idle",
  context: {
    game: null,
    seed: 0,
    strategies: [],
    config: { timeControl: null },
    disconnected: [],
    abandoned: [],
  },
  states: {
    idle: { on: { START: { target: "active", actions: "initGame" } } },
    active: {
      type: "parallel",
      always: { guard: "isOver", target: "gameOver" },
      on: {
        PLAYER_ACTION: { guard: "isMeta", actions: "applyPlayerAction" },
        SEAT_CONNECTION: { actions: "trackConnection" },
        ABANDON_READY: { actions: "markAbandoned" },
        RESET: { target: "idle" },
      },
      states: { boardA: boardRegion(0), boardB: boardRegion(1) },
    },
    gameOver: {
      on: { START: { target: "active", actions: "initGame" }, RESET: { target: "idle" } },
    },
  },
});

/** Bind an external engine (Fairy-Stockfish) for the AI seats. */
export function withBughouseAgent(agent: ChessAgent) {
  return bughouseMachine.provide({
    actors: {
      computeAiMove: fromPromise(async ({ input }: { input: ChessAgentRequest }) => {
        if (BUILT_IN_STRATEGIES.has(input.strategy)) return builtInMove(input);
        try {
          return await agent.bestMove(input);
        } catch (err) {
          console.warn("[bughouse] engine failed, playing the built-in move:", err);
          return builtInMove(input);
        }
      }),
    },
  });
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

type BughouseSnapshot = SnapshotFrom<typeof bughouseMachine>;

function legalActionsFor(snapshot: BughouseSnapshot, seat: number): BughouseAction[] {
  const ctx = snapshot.context;
  const game = ctx.game;
  if (!game || game.result || seat < 0 || seat > 3 || isAiSeat(ctx, seat)) return [];
  if (!snapshot.matches("active")) return [];
  const actions: BughouseAction[] = seatMoves(game, seat).map((uci) => ({ kind: "move", uci }));
  actions.push({ kind: "resign" });
  if (!isAiSeat(ctx, partnerOf(seat))) {
    for (const code of SIGNAL_CODES) actions.push({ kind: "signal", code });
  }
  if (ctx.abandoned.some((s) => teamOf(s) !== teamOf(seat))) actions.push({ kind: "claim-win" });
  return actions;
}

function buildView(snapshot: BughouseSnapshot, seat: number): BughousePlayerView {
  const ctx = snapshot.context;
  const game = ctx.game;
  const now = Date.now();
  const s = seat >= 0 && seat <= 3 ? seat : 0;
  const board = (i: BoardIndex) => {
    const b = game?.boards[i];
    return {
      fen: b ? toFen(b.position) : "",
      history: b ? [...b.history] : [],
      clock: b?.clock ? clockView(b.clock, now) : null,
      aiThinking: snapshot.matches({ active: { [i === 0 ? "boardA" : "boardB"]: "aiTurn" } }),
    };
  };
  return {
    boards: [board(0), board(1)],
    seat: s,
    board: boardOf(s),
    color: colorOf(s),
    partner: partnerOf(s),
    aiSeats: ctx.strategies.flatMap((st, i) => (st != null ? [i] : [])),
    disconnected: [...ctx.disconnected],
    abandoned: [...ctx.abandoned],
    signals: (game?.signals ?? []).filter((sig) => teamOf(sig.seat) === teamOf(s)),
    result: game?.result ?? null,
    timeControl: ctx.config.timeControl,
  };
}

export const bughouseSpec: GameMachineSpec<
  typeof bughouseMachine,
  BughousePlayerView,
  BughouseAction,
  BughouseResult,
  BughouseConfig
> = {
  machine: bughouseMachine,
  manifest: bughouseManifest,
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
  // Both boards play at once: every seat may act whenever its own board allows.
  getActivePlayer: () => -1,
  getResult: (snapshot) => snapshot.context.game?.result ?? null,
  isGameOver: (snapshot) => snapshot.matches("gameOver"),
  getOutcome(snapshot) {
    const result = snapshot.context.game?.result;
    return result ? { kind: "teams", teamOf: [...TEAM_OF], winningTeam: result.winningTeam } : null;
  },
  getReplayLog(snapshot): BughouseReplayLog | null {
    const { game, strategies, config } = snapshot.context;
    if (!game?.result) return null;
    return {
      formatVersion: 1,
      variant: "bughouse",
      startFen: game.boards[0].startFen,
      timeControl: config.timeControl,
      strategies,
      moves: [...game.moves],
      result: game.result,
    };
  },
};
