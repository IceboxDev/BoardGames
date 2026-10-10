/**
 * Go's session machine. The rules of the session live in `session.ts`; this
 * file decides WHEN they run: the AI's turn, the clock's flag and the scoring
 * phase's proposal and idle timer.
 *
 * Timers are re-armed on every re-entry of a turn state (each action routes
 * back through `routing`), and the delay is measured from `turnStartedAt`, so
 * a non-move action (a declined take-back) never resets anyone's clock.
 */

import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { playerActionValidator, safeApply } from "../../machines/action-validation";
import { MAX_TIMER_MS } from "../../machines/clock";
import { strategyGuard } from "../../machines/seats";
import type { GameMachineSpec } from "../../machines/types";
import { type GoAiServices, type GoMoveReply, inThreadGoAi, thinkBudgetMs } from "./ai/services";
import { koPoint } from "./game";
import { GO_STRATEGIES, type GoConfig, type GoStrategy, goManifest } from "./manifest";
import { goOutcome } from "./outcome";
import { buildReplayLog } from "./replay-log";
import {
  applyAction,
  applyAiMove,
  finalizeScore,
  type GoSession,
  isAi,
  isLocked,
  legalActionsFor,
  msLeftOnTurn,
  proposalKey,
  SCORING_IDLE_MS,
  scoringBreakdown,
  setProposal,
  startSession,
  timeout,
} from "./session";
import type { Color, GoGame } from "./types";
import type { GoAction, GoPlayerView, GoResult } from "./view";

export interface GoContext {
  /** `null` before START. */
  session: GoSession | null;
}

export type GoEvent =
  | {
      type: "START";
      seats: [GoStrategy | null, GoStrategy | null];
      config: GoConfig;
      seed: number;
    }
  /** `player`: the authenticated seat, set by `validateAction`. */
  | { type: "PLAYER_ACTION"; action: GoAction; player: number }
  | { type: "RESET" };

const AI_DELAY_MS = 250;

function aiActors(services: GoAiServices) {
  return {
    computeAiMove: fromPromise(
      async ({
        input,
      }: {
        input: { game: GoGame; strategy: GoStrategy; timeMs: number; seed: number };
      }) => {
        // Yield so the session manager flushes the previous state first.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return services.chooseMove(input);
      },
    ),
    proposeDead: fromPromise(async ({ input }: { input: { game: GoGame } }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return services.deadStones(input.game);
    }),
  };
}

function aiTurn(s: GoSession | null): boolean {
  return !!s && !s.end && !s.scoring && isAi(s, s.game.toMove);
}

function aiInput(s: GoSession, now: number) {
  const strategy = s.seats[s.game.toMove] as GoStrategy;
  let timeMs = thinkBudgetMs(strategy, s.game.size);
  if (s.timeControl.kind !== "none") {
    timeMs = Math.max(200, Math.min(timeMs, msLeftOnTurn(s, now) / 20));
  }
  return {
    game: s.game,
    strategy,
    timeMs,
    seed: (s.seed ^ (s.game.moves.length * 0x9e3779b1)) | 0,
  };
}

const toStrategy = strategyGuard("Go", GO_STRATEGIES);

export const goMachine = setup({
  types: {} as { context: GoContext; events: GoEvent },

  delays: {
    aiDelay: AI_DELAY_MS,
    flagDelay: ({ context }) => {
      const s = context.session;
      if (!s || s.timeControl.kind === "none") return MAX_TIMER_MS;
      return Math.min(MAX_TIMER_MS, Math.max(0, msLeftOnTurn(s, Date.now())));
    },
    scoringIdle: SCORING_IDLE_MS,
  },

  actors: aiActors(inThreadGoAi),

  guards: {
    noGame: ({ context }) => !context.session,
    isOver: ({ context }) => !!context.session?.end,
    inScoring: ({ context }) => !!context.session?.scoring,
    isAiTurn: ({ context }) => aiTurn(context.session),
    isTimed: ({ context }) => context.session?.timeControl.kind !== "none",
    proposing: ({ context }) => !!context.session?.scoring?.proposing,
    oneAccepted: ({ context }) => {
      const a = context.session?.scoring?.accepted;
      return !!a && (a[0] || a[1]);
    },
  },

  actions: {
    init: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("go", () => ({
        session: startSession(event.config, event.seats, event.seed, Date.now()),
      }));
    }),
    applyPlayer: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION" || !context.session) return {};
      const s = context.session;
      return safeApply("go", () => ({
        session: applyAction(s, event.player as Color, event.action, Date.now()),
      }));
    }),
    flag: assign(({ context }) => (context.session ? { session: timeout(context.session) } : {})),
  },
}).createMachine({
  id: "go",
  initial: "idle",
  context: { session: null },

  states: {
    idle: {
      on: { START: { target: "active", actions: "init" } },
    },

    active: {
      initial: "routing",
      on: {
        START: { target: "active", actions: "init" },
        RESET: { target: "idle" },
      },
      states: {
        routing: {
          always: [
            { guard: "noGame", target: "#go.idle" },
            { guard: "isOver", target: "#go.gameOver" },
            { guard: "inScoring", target: "scoring" },
            { guard: "isAiTurn", target: "aiThinking" },
            { target: "awaitingPlayer" },
          ],
        },

        awaitingPlayer: {
          after: { flagDelay: { guard: "isTimed", target: "routing", actions: "flag" } },
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayer" } },
        },

        aiThinking: {
          after: {
            aiDelay: "aiActing",
            flagDelay: { guard: "isTimed", target: "routing", actions: "flag" },
          },
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayer" } },
        },

        aiActing: {
          after: { flagDelay: { guard: "isTimed", target: "routing", actions: "flag" } },
          invoke: {
            src: "computeAiMove",
            input: ({ context }) => aiInput(context.session as GoSession, Date.now()),
            onDone: {
              target: "routing",
              actions: assign(({ context, event }) => {
                const s = context.session;
                if (!s) return {};
                const reply: GoMoveReply = event.output;
                return safeApply("go", () => ({
                  session: applyAiMove(s, reply.point, reply.degraded === true, Date.now()),
                }));
              }),
            },
            // Back through the delay, so a persistent failure never hot-loops.
            onError: { target: "aiThinking" },
          },
          on: { PLAYER_ACTION: { target: "routing", actions: "applyPlayer" } },
        },

        scoring: {
          initial: "check",
          states: {
            check: {
              always: [{ guard: "proposing", target: "proposing" }, { target: "deciding" }],
            },
            proposing: {
              invoke: {
                src: "proposeDead",
                input: ({ context }) => ({ game: (context.session as GoSession).game }),
                onDone: {
                  target: "#go.active.routing",
                  actions: assign(({ context, event }) => {
                    const s = context.session;
                    if (!s) return {};
                    const dead: readonly number[] = event.output;
                    return safeApply("go", () => ({ session: setProposal(s, dead, Date.now()) }));
                  }),
                },
                // No proposal: start from "everything alive" and let the players mark.
                onError: {
                  target: "#go.active.routing",
                  actions: assign(({ context }) =>
                    context.session
                      ? { session: setProposal(context.session, [], Date.now()) }
                      : {},
                  ),
                },
              },
              on: { PLAYER_ACTION: { target: "#go.active.routing", actions: "applyPlayer" } },
            },
            deciding: {
              after: {
                scoringIdle: {
                  guard: "oneAccepted",
                  target: "#go.active.routing",
                  actions: assign(({ context }) =>
                    context.session?.scoring ? { session: finalizeScore(context.session) } : {},
                  ),
                },
              },
              on: { PLAYER_ACTION: { target: "#go.active.routing", actions: "applyPlayer" } },
            },
          },
        },
      },
    },

    gameOver: {
      on: {
        START: { target: "active", actions: "init" },
        RESET: { target: "idle" },
      },
    },
  },
});

/** The machine with the server's AI services (worker pool, KataGo) bound in. */
export function withGoAi(services: GoAiServices): typeof goMachine {
  return goMachine.provide({ actors: aiActors(services) });
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

type GoSnapshot = SnapshotFrom<typeof goMachine>;

function legalActions(snapshot: GoSnapshot, player: number): GoAction[] {
  const s = snapshot.context.session;
  if (!s || !snapshot.matches("active")) return [];
  return legalActionsFor(s, player);
}

export function buildPlayerView(s: GoSession, player: number, now: number): GoPlayerView {
  const { game } = s;
  const running = s.end || s.scoring || s.timeControl.kind === "none" ? null : game.toMove;
  return {
    size: game.size,
    komi: game.komi,
    handicap: game.handicap,
    handicapStones: game.handicapStones,
    board: game.board,
    toMove: game.toMove,
    captures: game.captures,
    moves: game.moves.map((m) => ({ color: m.color, point: m.point, captured: m.captured.length })),
    koPoint: s.end || s.scoring ? null : koPoint(game),
    you: player === 0 || player === 1 ? player : null,
    players: [s.seats[0], s.seats[1]],
    clock:
      s.timeControl.kind === "none"
        ? null
        : {
            timeControl: s.timeControl,
            clocks: [s.clocks[0], s.clocks[1]],
            running,
            elapsedMs: running === null ? 0 : Math.max(0, now - s.turnStartedAt),
          },
    undoRequest: s.undoRequest,
    scoring: s.scoring
      ? {
          dead: s.scoring.dead,
          accepted: s.scoring.accepted,
          key: proposalKey(s),
          proposing: s.scoring.proposing,
          locked: isLocked(s),
          breakdown: scoringBreakdown(s),
        }
      : null,
    resumes: s.resumes,
    result: s.end,
    aiDegraded: s.aiDegraded,
  };
}

const PLACEHOLDER_VIEW_SESSION = startSession(goManifest.config.parse({}), [null, null], 0, 0);

export const goSpec: GameMachineSpec<typeof goMachine, GoPlayerView, GoAction, GoResult, GoConfig> =
  {
    machine: goMachine,
    manifest: goManifest,

    buildStart: ({ seats, config, seed }) => ({
      type: "START",
      seats: [
        seats[0]?.kind === "ai" ? toStrategy(seats[0].strategy) : null,
        seats[1]?.kind === "ai" ? toStrategy(seats[1].strategy) : null,
      ],
      config,
      seed,
    }),

    getPlayerView: (snapshot, player) =>
      buildPlayerView(snapshot.context.session ?? PLACEHOLDER_VIEW_SESSION, player, Date.now()),

    getLegalActions: legalActions,

    getActivePlayer: (snapshot) => {
      const s = snapshot.context.session;
      if (!s || s.scoring) return -1;
      return s.game.toMove;
    },

    getResult: (snapshot) => snapshot.context.session?.end ?? null,
    isGameOver: (snapshot) => snapshot.matches("gameOver"),

    getOutcome: (snapshot) => {
      const end = snapshot.context.session?.end;
      return end ? goOutcome(end) : null;
    },

    getReplayLog: (snapshot) => {
      const s = snapshot.context.session;
      return s ? buildReplayLog(s) : null;
    },

    validateAction: playerActionValidator({
      legalActions,
      toEvent: (action: GoAction, player: number): GoEvent => ({
        type: "PLAYER_ACTION",
        action,
        player,
      }),
    }),

    // Resigning, asking for and answering a take-back happen off turn;
    // `getLegalActions` says exactly what each seat may do at any moment.
    acceptsOffTurn: () => true,
  };
