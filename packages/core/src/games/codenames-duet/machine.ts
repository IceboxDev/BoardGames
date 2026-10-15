import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import {
  type ActionValidation,
  acceptAction,
  matchLegalAction,
  parseActionSync,
  rejectAction,
  safeApply,
} from "../../machines/action-validation";
import { seatStrategies } from "../../machines/seats";
import type { GameMachineSpec } from "../../machines/types";
import type {
  ClueInput,
  CodenamesAiAgent,
  GuessInput,
  PublicTurn,
  SpymasterTurn,
} from "../codenames/ai/agent";
import { fallbackClue, fallbackCodenamesAgent, fallbackGuess } from "../codenames/ai/fallback";
import { DEFAULT_CODENAMES_MODEL } from "../codenames/ai/models";
import {
  AI_CLUE_DEADLINE_MS,
  AI_GUESS_DEADLINE_MS,
  raceWithFallback,
  type SettledClue,
  type SettledPicks,
  settleClue,
  settlePicks,
  type TableShape,
} from "../codenames/machine";
import { aiCostOf, personClueNote } from "../codenames/notes";
import { type DuetConfig, duetManifest } from "./manifest";
import { buildDuetView } from "./player-view";
import type { DuetReplayLog } from "./record";
import {
  agentsLeftOn,
  applyChat,
  applyClue,
  applyEndTurn,
  applyGuess,
  applyTimeout,
  attachGuessNote,
  canChat,
  cleanTargets,
  clueProblemFor,
  createDuet,
  currentTurn,
  guessableCards,
  guesserOf,
  isAiSeat,
  judgedSide,
  legalActionsFor,
} from "./rules";
import {
  ChatActionSchema,
  type DuetAction,
  type DuetMachineEvent,
  type DuetPlayerView,
  type DuetResult,
  type DuetState,
  type DuetViewPhase,
  GiveClueActionSchema,
  type Side,
} from "./types";

// ---------------------------------------------------------------------------
// Duet machine — the same shape as the classic one: the rules engine owns the
// phase and the machine routes on it, running AI turns and the timers.
// ---------------------------------------------------------------------------

/** The turns so far from `side`'s seat; `upToLive: false` leaves out the turn in progress. */
function history(state: DuetState, side: Side, upToLive = true): PublicTurn[] {
  return (upToLive ? state.turns : state.turns.slice(0, -1))
    .filter((t) => t.clue !== null)
    .map((t) => ({
      by: t.giver === side ? "us" : "them",
      clue: t.clue,
      guesses: t.guesses.map((g) => ({
        word: state.words[g.card] ?? "",
        result: g.result === "agent" ? "own" : g.result,
      })),
    }));
}

/** The shared history, plus the words this side's own clues were aimed at. */
function giverHistory(state: DuetState, side: Side): SpymasterTurn[] {
  const played = state.turns.filter((t) => t.clue !== null);
  return history(state, side).map((turn, i) => {
    const note = played[i]?.note;
    if (turn.by !== "us" || !note) return turn;
    return { ...turn, intended: note.targets.map((c) => state.words[c] ?? "") };
  });
}

/** Clue legality is checked against every card not yet found. */
function duetTable(state: DuetState): TableShape {
  return {
    words: state.words,
    faceDown: (card) => state.found[card] === false,
    ours: (card) => state.key[card]?.[state.giver] === "agent",
    language: state.language,
  };
}

export function buildDuetClueInput(state: DuetState): ClueInput {
  const side = state.giver;
  return {
    model: state.ai[side] ?? DEFAULT_CODENAMES_MODEL,
    mode: "duet",
    language: state.language,
    cards: state.words.map((word, index) => {
      const entry = state.key[index]?.[side] ?? "bystander";
      return {
        index,
        word,
        kind: entry === "agent" ? "own" : entry,
        // Found agents, and cards already shown to be this side's bystanders,
        // are settled for this clue-giver.
        revealed: state.found[index] === true || state.bystanders[side][index] === true,
      };
    }),
    history: giverHistory(state, side),
    agentsLeft: agentsLeftOn(state, side),
    turnsLeft: state.tokens,
  };
}

/** The guesser's input — the cards they may touch, never a key side. */
export function buildDuetGuessInput(state: DuetState): GuessInput {
  const guesser = guesserOf(state);
  const clue =
    state.phase === "sudden-death"
      ? { word: "(sudden death — no clue)", count: 0 as const }
      : (currentTurn(state).clue ?? { word: "", count: 1 });
  return {
    model: state.ai[guesser] ?? DEFAULT_CODENAMES_MODEL,
    mode: "duet",
    language: state.language,
    words: guessableCards(state, guesser).map((index) => ({
      index,
      word: state.words[index] ?? "",
    })),
    clue,
    guessesLeft: state.phase === "sudden-death" ? 1 : null,
    agentsLeft: agentsLeftOn(state, judgedSide(state)),
    turnsLeft: state.tokens,
    // The guesser reads its partner's clues: from the giver's side, "us" are
    // the clues this guesser has been answering. The live clue isn't history.
    history: history(state, judgedSide(state), false),
  };
}

function aiActors(agent: CodenamesAiAgent) {
  return {
    computeClue: fromPromise(async ({ input }: { input: { state: DuetState } }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const clueInput = buildDuetClueInput(input.state);
      const fallback = () => fallbackClue(clueInput);
      const raw = await raceWithFallback<unknown>(
        () => agent.giveClue(clueInput),
        fallback,
        AI_CLUE_DEADLINE_MS,
        "codenames-duet",
      );
      return settleClue(raw, duetTable(input.state), fallback);
    }),

    computeGuess: fromPromise(async ({ input }: { input: { state: DuetState } }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const guessInput = buildDuetGuessInput(input.state);
      const fallback = () => fallbackGuess(guessInput);
      const raw = await raceWithFallback<unknown>(
        () => agent.guess(guessInput),
        fallback,
        AI_GUESS_DEADLINE_MS,
        "codenames-duet",
      );
      return settlePicks(
        raw,
        guessInput.words.map((w) => w.index),
        guessInput.guessesLeft,
        fallback,
      );
    }),
  };
}

const IDLE_STATE: DuetState = createDuet({
  seed: 0,
  ai: [null, null],
  language: "en",
  timerTokens: 9,
  clueTimerSec: 0,
  guessTimerSec: 0,
});

type ActionEvent = Extract<DuetMachineEvent, { type: "PLAYER_ACTION" }>;

function actionOf<K extends DuetAction["kind"]>(
  event: DuetMachineEvent,
  kind: K,
): (ActionEvent & { action: Extract<DuetAction, { kind: K }> }) | null {
  if (event.type !== "PLAYER_ACTION" || event.action.kind !== kind) return null;
  return event as ActionEvent & { action: Extract<DuetAction, { kind: K }> };
}

const msUntil = (deadline: number | null) =>
  deadline === null ? 0 : Math.max(0, deadline - Date.now());

export const duetMachine = setup({
  types: {} as { context: { game: DuetState }; events: DuetMachineEvent },

  delays: {
    aiStart: ({ context }) => context.game.beats.aiStart,
    aiGuess: ({ context }) => context.game.beats.aiGuess,
    timeout: ({ context }) => msUntil(context.game.deadlineTs),
  },

  actors: aiActors(fallbackCodenamesAgent),

  guards: {
    isOver: ({ context }) => context.game.phase === "over",
    inClue: ({ context }) => context.game.phase === "clue",
    inGuessing: ({ context }) =>
      context.game.phase === "guessing" || context.game.phase === "sudden-death",
    giverIsAi: ({ context }) => isAiSeat(context.game, context.game.giver),
    guesserIsAi: ({ context }) => isAiSeat(context.game, guesserOf(context.game)),
    clueTimerOn: ({ context }) => context.game.clueTimerSec > 0,
    // No timer in sudden death: there is no turn left to lose.
    guessTimerOn: ({ context }) =>
      context.game.guessTimerSec > 0 && context.game.phase === "guessing",
    isGiveClue: ({ context, event }) => {
      const e = actionOf(event, "give-clue");
      return e !== null && clueProblemFor(context.game, e.player, e.action.clue) === null;
    },
    isGuessMove: ({ event }) =>
      event.type === "PLAYER_ACTION" &&
      (event.action.kind === "guess" || event.action.kind === "end-turn"),
    isChat: ({ context, event }) => {
      const e = actionOf(event, "chat");
      return e !== null && canChat(context.game, e.player);
    },
    // The AI's picks are spent, or the turn (or guesser) changed under it.
    aiTurnDone: ({ context }) => {
      const g = context.game;
      if (g.phase !== "guessing" && g.phase !== "sudden-death") return true;
      if (!isAiSeat(g, guesserOf(g))) return true;
      return g.aiQueue.length === 0;
    },
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("codenames-duet", () => ({
        game: createDuet({
          seed: event.seed,
          ai: event.ai,
          language: event.language,
          timerTokens: event.timerTokens,
          clueTimerSec: event.clueTimerSec,
          guessTimerSec: event.guessTimerSec,
          ...(event.beats ? { beats: event.beats } : {}),
        }),
      }));
    }),

    armClueTimer: assign(({ context }) => ({
      game: {
        ...context.game,
        deadlineTs: context.game.deadlineTs ?? Date.now() + context.game.clueTimerSec * 1000,
      },
    })),

    armGuessTimer: assign(({ context }) => ({
      game: {
        ...context.game,
        deadlineTs: context.game.deadlineTs ?? Date.now() + context.game.guessTimerSec * 1000,
      },
    })),

    timeOut: assign(({ context }) => ({ game: applyTimeout(context.game) })),

    applyClue: assign(({ context, event }) => {
      const e = actionOf(event, "give-clue");
      if (!e) return {};
      const targets = e.action.targets ?? [];
      const note = targets.length > 0 ? personClueNote(targets) : undefined;
      return safeApply("codenames-duet", () => ({
        game: applyClue(context.game, e.player, e.action.clue, note),
      }));
    }),

    applyGuessMove: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      const { action, player } = event;
      return safeApply("codenames-duet", () => {
        if (action.kind === "guess") return { game: applyGuess(context.game, player, action.card) };
        if (action.kind === "end-turn") return { game: applyEndTurn(context.game, player) };
        return {};
      });
    }),

    appendChat: assign(({ context, event }) => {
      const e = actionOf(event, "chat");
      if (!e) return {};
      return safeApply("codenames-duet", () => ({
        game: applyChat(context.game, e.player, e.action.text),
      }));
    }),

    markGiverThinking: assign(({ context }) => ({
      game: { ...context.game, aiThinking: context.game.giver },
    })),

    markGuesserThinking: assign(({ context }) => ({
      game: { ...context.game, aiThinking: guesserOf(context.game) },
    })),

    recordAiClue: assign(({ context, event }) => {
      const output = (event as { output?: Partial<SettledClue> }).output;
      const game = { ...context.game, aiThinking: null };
      const settled = settleClue(
        output?.clue ? { ...output.clue, ...output.note } : null,
        duetTable(game),
        () => fallbackClue(buildDuetClueInput(game)),
      );
      return safeApply("codenames-duet", () => ({
        game: applyClue(game, game.giver, settled.clue, settled.note),
      }));
    }),

    recordFallbackClue: assign(({ context }) => {
      const game = { ...context.game, aiThinking: null };
      const settled = settleClue(null, duetTable(game), () =>
        fallbackClue(buildDuetClueInput(game)),
      );
      return safeApply("codenames-duet", () => ({
        game: applyClue(game, game.giver, settled.clue, settled.note),
      }));
    }),

    queueAiPicks: assign(({ context, event }) => {
      const output = (event as { output?: SettledPicks }).output;
      const game = { ...context.game, aiQueue: [...(output?.picks ?? [])], aiThinking: null };
      return { game: output ? attachGuessNote(game, output.note) : game };
    }),

    queueFallbackPicks: assign(({ context }) => {
      const input = buildDuetGuessInput(context.game);
      const settled = settlePicks(
        null,
        input.words.map((w) => w.index),
        input.guessesLeft,
        () => fallbackGuess(input),
      );
      return {
        game: attachGuessNote(
          { ...context.game, aiQueue: settled.picks, aiThinking: null },
          settled.note,
        ),
      };
    }),

    touchNextAiPick: assign(({ context }) => {
      const game = context.game;
      const card = game.aiQueue[0];
      if (card === undefined) return {};
      const seat = guesserOf(game);
      const rest = { ...game, aiQueue: game.aiQueue.slice(1) };
      return safeApply("codenames-duet", () => ({ game: applyGuess(rest, seat, card) }));
    }),

    // An AI guesser out of picks stops (outside sudden death, where each
    // guess hands over to the partner on its own).
    stopAiTurn: assign(({ context }) => {
      const game = context.game;
      const seat = guesserOf(game);
      if (game.phase !== "guessing" || !isAiSeat(game, seat)) return {};
      if (currentTurn(game).guesses.length === 0) return {};
      return safeApply("codenames-duet", () => ({ game: applyEndTurn(game, seat) }));
    }),
  },
}).createMachine({
  id: "duet",
  initial: "idle",
  context: { game: IDLE_STATE },

  states: {
    idle: { on: { START: { target: "active", actions: "initGame" } } },

    active: {
      initial: "route",
      on: {
        PLAYER_ACTION: { guard: "isChat", actions: "appendChat" },
        START: { target: "active", actions: "initGame" },
        RESET: { target: "idle" },
      },
      states: {
        route: {
          always: [
            { guard: "isOver", target: "#duet.gameOver" },
            { guard: "inClue", target: "clue" },
            { guard: "inGuessing", target: "guessing" },
            { target: "#duet.gameOver" },
          ],
        },

        clue: {
          initial: "decide",
          states: {
            decide: {
              always: [
                { guard: "giverIsAi", target: "aiWaiting" },
                { guard: "clueTimerOn", target: "timed", actions: "armClueTimer" },
                { target: "waiting" },
              ],
            },
            waiting: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGiveClue",
                  actions: "applyClue",
                  target: "#duet.active.route",
                },
              },
            },
            timed: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGiveClue",
                  actions: "applyClue",
                  target: "#duet.active.route",
                },
              },
              after: { timeout: { actions: "timeOut", target: "#duet.active.route" } },
            },
            aiWaiting: {
              entry: "markGiverThinking",
              after: { aiStart: { target: "aiCalling" } },
            },
            aiCalling: {
              invoke: {
                src: "computeClue",
                input: ({ context }) => ({ state: context.game }),
                onDone: { actions: "recordAiClue", target: "#duet.active.route" },
                onError: { actions: "recordFallbackClue", target: "#duet.active.route" },
              },
            },
          },
        },

        guessing: {
          initial: "decide",
          states: {
            decide: {
              always: [
                { guard: "guesserIsAi", target: "aiWaiting" },
                { guard: "guessTimerOn", target: "timed", actions: "armGuessTimer" },
                { target: "waiting" },
              ],
            },
            waiting: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGuessMove",
                  actions: "applyGuessMove",
                  target: "#duet.active.route",
                },
              },
            },
            timed: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGuessMove",
                  actions: "applyGuessMove",
                  target: "#duet.active.route",
                },
              },
              after: { timeout: { actions: "timeOut", target: "#duet.active.route" } },
            },
            aiWaiting: {
              entry: "markGuesserThinking",
              after: { aiStart: { target: "aiCalling" } },
            },
            aiCalling: {
              invoke: {
                src: "computeGuess",
                input: ({ context }) => ({ state: context.game }),
                onDone: { actions: "queueAiPicks", target: "aiTouching" },
                onError: { actions: "queueFallbackPicks", target: "aiTouching" },
              },
            },
            aiTouching: {
              always: { guard: "aiTurnDone", actions: "stopAiTurn", target: "#duet.active.route" },
              after: {
                aiGuess: { actions: "touchNextAiPick", target: "aiTouching", reenter: true },
              },
            },
          },
        },
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

type DuetSnapshot = SnapshotFrom<typeof duetMachine>;

export function duetPhaseOf(snapshot: DuetSnapshot): DuetViewPhase {
  if (snapshot.matches("idle")) return "idle";
  if (snapshot.matches("gameOver")) return "over";
  return snapshot.context.game.phase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const toEvent = (player: number, action: DuetAction): DuetMachineEvent => ({
  type: "PLAYER_ACTION",
  player,
  action,
});

function validateDuetAction(
  snapshot: DuetSnapshot,
  player: number,
  raw: unknown,
): ActionValidation<DuetMachineEvent> {
  if (!isRecord(raw)) return rejectAction("action must be an object");
  if (raw.type !== "PLAYER_ACTION") {
    return rejectAction(`unsupported action type "${String(raw.type)}"`);
  }
  if (!isRecord(raw.action)) return rejectAction("PLAYER_ACTION is missing its `action` payload");
  if (!snapshot.matches("active")) return rejectAction("the game isn't running");
  const game = snapshot.context.game;
  const kind = raw.action.kind;

  if (kind === "give-clue") {
    const parsed = parseActionSync(GiveClueActionSchema, raw.action);
    if (!parsed.ok) return rejectAction(parsed.reason);
    if (isAiSeat(game, player)) return rejectAction("that seat is played by the AI");
    const problem = clueProblemFor(game, player, parsed.value.clue);
    if (problem !== null) return rejectAction(problem);
    const targets = cleanTargets(game, parsed.value.targets ?? []);
    return acceptAction(
      toEvent(player, {
        kind: "give-clue",
        clue: parsed.value.clue,
        ...(targets.length > 0 ? { targets } : {}),
      }),
    );
  }

  if (kind === "chat") {
    const parsed = parseActionSync(ChatActionSchema, raw.action);
    if (!parsed.ok) return rejectAction(parsed.reason);
    if (!canChat(game, player)) {
      return rejectAction("the clue-giver keeps quiet until the turn ends");
    }
    return acceptAction(toEvent(player, { kind: "chat", text: parsed.value.text }));
  }

  const legal = legalActionsFor(game, player);
  if (legal.length === 0) return rejectAction("you have no moves right now");
  const match = matchLegalAction(legal, raw.action);
  if (match === undefined) return rejectAction("that move isn't legal right now");
  return acceptAction(toEvent(player, match));
}

export function withDuetAgent(agent: CodenamesAiAgent): typeof duetMachine {
  return duetMachine.provide({ actors: aiActors(agent) });
}

export const duetSpec: GameMachineSpec<
  typeof duetMachine,
  DuetPlayerView,
  DuetAction,
  DuetResult,
  DuetConfig
> = {
  machine: duetMachine,
  manifest: duetManifest,

  buildStart: ({ seats, config, seed }) => ({
    type: "START",
    seed,
    ai: seatStrategies(seats),
    language: config.language,
    timerTokens: config.timerTokens,
    clueTimerSec: config.clueTimerSec,
    guessTimerSec: config.guessTimerSec,
  }),

  getPlayerView(snapshot, player) {
    return buildDuetView(snapshot.context.game, duetPhaseOf(snapshot), player);
  },

  getLegalActions(snapshot, player) {
    if (!snapshot.matches("active")) return [];
    return legalActionsFor(snapshot.context.game, player);
  },

  validateAction: validateDuetAction,

  // Chat flows from both seats at any time, so no single active player.
  getActivePlayer(snapshot) {
    return snapshot.matches("idle") ? 0 : -1;
  },

  getResult(snapshot) {
    return snapshot.context.game.result;
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getOutcome(snapshot) {
    const game = snapshot.context.game;
    if (!snapshot.matches("gameOver") || game.result === null) return null;
    return {
      kind: "coop",
      won: game.result.won,
      score: game.result.agentsFound,
      detail: game.result.won ? "won" : game.result.reason,
    };
  },

  getReplayLog(snapshot): DuetReplayLog | null {
    const game = snapshot.context.game;
    if (!snapshot.matches("gameOver") || game.result === null) return null;
    return {
      formatVersion: 1,
      seed: game.seed,
      language: game.language,
      ai: [game.ai[0], game.ai[1]],
      words: [...game.words],
      key: game.key.map((pair) => [pair[0], pair[1]] as [(typeof pair)[0], (typeof pair)[1]]),
      tokensTotal: game.tokensTotal,
      turns: game.turns.map((t) => ({ ...t, guesses: [...t.guesses] })),
      result: game.result,
      aiCost: aiCostOf(game.turns),
    };
  },
};
