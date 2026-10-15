// The online Blood on the Clocktower machine and its `GameMachineSpec`.
//
// The machine is thin: every move is `applyOnline` (online/apply.ts), a pure
// reducer the validator also dry-runs, so a move the machine would refuse is
// rejected with its reason before it is sent. The only thing the machine adds
// is time — the vote's clock hand and the stand-in bots' next beat
// (online/bots.ts), one delayed transition re-armed whenever anything
// happens (the chess flag's pattern).
//
// The phone companion (the solo "Companion" card) doesn't use any of this.

import { assign, type SnapshotFrom, setup } from "xstate";
import {
  type ActionValidation,
  acceptAction,
  parseActionSync,
  rejectAction,
} from "../../machines/action-validation.ts";
import type { GameOutcome } from "../../machines/outcome.ts";
import type { GameMachineSpec } from "../../machines/types.ts";
import { isEvilPlayer } from "./companion.ts";
import { type BotcConfig, botcManifest, STORYTELLER_SEAT } from "./manifest.ts";
import { type OnlineAction, OnlineActionSchema } from "./online/actions.ts";
import { applyOnline, setConnected, tickVote } from "./online/apply.ts";
import { BOT_NAMES, nextBotPlan, runBotPlan } from "./online/bots.ts";
import { createOnlineGame } from "./online/create.ts";
import type { BotcOnline, BotcReplayLog } from "./online/state.ts";
import { type BotcView, viewFor } from "./online/view.ts";

/** The longest the machine sleeps between looks at the clock. */
const MAX_TIMER_MS = 60_000;

export type BotcMachineEvent =
  | { type: "START"; names: string[]; config: BotcConfig; seed: number; bots: number[] }
  | { type: "PLAYER_ACTION"; player: number; action: OnlineAction }
  | { type: "SEAT_CONNECTION"; seat: number; connected: boolean };

export interface BotcContext {
  game: BotcOnline | null;
  /** Room seats the stand-in bots play. */
  bots: number[];
  /** Bots whose last plan was refused — left out until the game moves on (log length). */
  stuck: { at: number; seats: number[] };
}

function skipped(context: BotcContext): Set<number> {
  const game = context.game;
  return new Set(game && context.stuck.at === game.log.length ? context.stuck.seats : []);
}

/** When the next timed thing happens — the clock hand or a bot — or `null` for nothing. */
function nextTimerAt(context: BotcContext): number | null {
  const game = context.game;
  if (!game) return null;
  const vote = game.day.vote;
  const tick = vote?.status === "running" ? (vote.nextTickAt ?? null) : null;
  const bot = nextBotPlan(game, context.bots, skipped(context))?.at ?? null;
  if (tick === null) return bot;
  return bot === null ? tick : Math.min(tick, bot);
}

function msUntilTimer(context: BotcContext): number {
  const at = nextTimerAt(context);
  if (at === null) return MAX_TIMER_MS;
  return Math.max(0, Math.min(MAX_TIMER_MS, at - Date.now()));
}

export const botcMachine = setup({
  types: {} as { context: BotcContext; events: BotcMachineEvent },

  delays: {
    timer: ({ context }) => msUntilTimer(context),
  },

  guards: {
    isOver: ({ context }) => context.game?.stage === "over",
    timed: ({ context }) => nextTimerAt(context) !== null,
  },

  actions: {
    init: assign(({ event }) => {
      if (event.type !== "START") return {};
      return { game: createOnlineGame(event), bots: [...event.bots] };
    }),
    apply: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION" || !context.game) return {};
      const result = applyOnline(context.game, event.player, event.action, Date.now());
      if (!result.ok) {
        console.warn(`[blood-on-the-clocktower] refused: ${result.reason}`);
        return {};
      }
      return { game: result.game };
    }),
    /** The clock hand moves on, then a bot whose beat has come plays it. */
    tick: assign(({ context }) => {
      if (!context.game) return {};
      const now = Date.now();
      const game = tickVote(context.game, now);
      const plan = nextBotPlan(game, context.bots, skipped({ ...context, game }));
      if (!plan || plan.at > now) return game === context.game ? {} : { game };
      const ran = runBotPlan(game, plan, now);
      if (ran.refused) {
        console.warn(`[blood-on-the-clocktower] bot ${plan.seat} refused: ${ran.refused}`);
        const seats = context.stuck.at === game.log.length ? context.stuck.seats : [];
        return { game: ran.game, stuck: { at: game.log.length, seats: [...seats, plan.seat] } };
      }
      return { game: ran.game };
    }),
    trackConnection: assign(({ context, event }) => {
      if (event.type !== "SEAT_CONNECTION" || !context.game) return {};
      return { game: setConnected(context.game, event.seat, event.connected) };
    }),
  },
}).createMachine({
  id: "botc",
  initial: "idle",
  context: { game: null, bots: [], stuck: { at: -1, seats: [] } },
  states: {
    idle: {
      on: { START: { target: "active", actions: "init" } },
    },
    active: {
      initial: "routing",
      states: {
        routing: {
          always: [
            { guard: "isOver", target: "#botc.over" },
            { guard: "timed", target: "timed" },
            { target: "waiting" },
          ],
        },
        waiting: {},
        timed: {
          after: { timer: { target: "routing", actions: "tick" } },
        },
      },
      on: {
        PLAYER_ACTION: { target: ".routing", actions: "apply" },
        SEAT_CONNECTION: { target: ".routing", actions: "trackConnection" },
      },
    },
    // The game is decided; the town may still talk and read its whispers.
    over: {
      on: {
        PLAYER_ACTION: { actions: "apply" },
        SEAT_CONNECTION: { actions: "trackConnection" },
      },
    },
  },
});

export type BotcSnapshot = SnapshotFrom<typeof botcMachine>;

/** A small menu of moves, so a test (and a hurried Storyteller) can always end a game. */
function legalActionsFor(snapshot: BotcSnapshot, player: number): OnlineAction[] {
  const game = snapshot.context.game;
  if (!game || game.stage === "over") return [];
  if (player === STORYTELLER_SEAT) {
    const rev = game.rev;
    switch (game.stage) {
      case "setup":
        return game.setup?.bag ? [{ kind: "deal", rev }] : [];
      case "reveal":
        return game.shown.some(Boolean)
          ? [{ kind: "begin-night", rev }]
          : [{ kind: "reveal-characters", rev }];
      case "play":
        return [
          { kind: "end-game", rev, winner: "good", reason: "The Storyteller ended the game" },
          { kind: "end-game", rev, winner: "evil", reason: "The Storyteller ended the game" },
        ];
    }
  }
  const shown = game.shown[player];
  return shown && !shown.acknowledged ? [{ kind: "ack-character" }] : [];
}

function validateBotcAction(
  snapshot: BotcSnapshot,
  player: number,
  raw: unknown,
): ActionValidation<BotcMachineEvent> {
  const game = snapshot.context.game;
  if (!game) return rejectAction("the game hasn't started");
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as { type?: unknown }).type !== "PLAYER_ACTION"
  ) {
    return rejectAction("expected a PLAYER_ACTION");
  }
  const parsed = parseActionSync(OnlineActionSchema, (raw as { action?: unknown }).action);
  if (!parsed.ok) return rejectAction(parsed.reason);
  // Dry-run: the machine applies exactly this, so its refusal is the answer.
  const result = applyOnline(game, player, parsed.value, Date.now());
  if (!result.ok) return rejectAction(result.reason);
  return acceptAction({ type: "PLAYER_ACTION", player, action: parsed.value });
}

/** Good is team 0, evil team 1 — by each player's alignment when it ended; the Storyteller moderates. */
function outcomeOf(game: BotcOnline): GameOutcome | null {
  const phase = game.companion?.phase;
  if (!game.companion || phase?.kind !== "ended") return null;
  const teamOf = game.names.map((_, seat) => {
    const p = game.companion?.players.find((x) => x.roomSeat === seat);
    return p && isEvilPlayer(p) ? 1 : 0;
  });
  return {
    kind: "teams",
    teamOf,
    winningTeam: phase.winner === "good" ? 0 : 1,
    moderatorSeats: [STORYTELLER_SEAT],
  };
}

export interface BotcResult {
  readonly winner: "good" | "evil";
  readonly reason: string;
}

export const botcSpec: GameMachineSpec<
  typeof botcMachine,
  BotcView,
  OnlineAction,
  BotcResult,
  BotcConfig
> = {
  machine: botcMachine,
  manifest: botcManifest,

  buildStart: ({ seats, config, seed }) => {
    // A solo seat has no room name: with bots at the table, it's "You".
    const solo = seats.some((s) => s.kind === "ai");
    return {
      type: "START",
      names: seats.map((s, i) =>
        s.kind === "ai"
          ? (BOT_NAMES[i] ?? `Bot ${i}`)
          : s.name
            ? s.name
            : i === STORYTELLER_SEAT
              ? solo
                ? "You (Storyteller)"
                : "Storyteller"
              : solo
                ? "You"
                : `Player ${i}`,
      ),
      config,
      seed,
      bots: seats.flatMap((s, i) => (s.kind === "ai" ? [i] : [])),
    };
  },

  getPlayerView(snapshot, player) {
    const game = snapshot.context.game;
    if (!game) throw new Error("botcSpec.getPlayerView called before the game started");
    return viewFor(game, player);
  },

  getLegalActions: legalActionsFor,

  validateAction: validateBotcAction,

  // Anyone may talk at any time; who may do what is `applyOnline`'s call.
  getActivePlayer(snapshot) {
    return snapshot.context.game ? -1 : 0;
  },

  getResult(snapshot) {
    const phase = snapshot.context.game?.companion?.phase;
    return phase?.kind === "ended" ? { winner: phase.winner, reason: phase.reason } : null;
  },

  isGameOver(snapshot) {
    return snapshot.matches("over");
  },

  getOutcome(snapshot) {
    const game = snapshot.context.game;
    return game ? outcomeOf(game) : null;
  },

  getReplayLog(snapshot): BotcReplayLog | null {
    const game = snapshot.context.game;
    if (!game || game.stage !== "over") return null;
    return {
      formatVersion: 1,
      seed: game.seed,
      config: game.config,
      names: [...game.names],
      actions: game.log,
      final: { ...game, log: [] },
    };
  },
};
