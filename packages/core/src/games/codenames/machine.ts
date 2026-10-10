import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { z } from "zod";
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
  ClueOutput,
  CodenamesAiAgent,
  GuessInput,
  GuessOutput,
  PublicTurn,
  SpymasterTurn,
} from "./ai/agent";
import { fallbackClue, fallbackCodenamesAgent, fallbackGuess } from "./ai/fallback";
import { DEFAULT_CODENAMES_MODEL } from "./ai/models";
import { type Clue, ClueCountSchema, cleanClueWord, clueProblem } from "./clue-rules";
import { type CodenamesConfig, codenamesManifest } from "./manifest";
import {
  aiCostOf,
  type ClueNote,
  cleanCards,
  cleanCost,
  cleanNoteText,
  cleanTraceIds,
  type GuessNote,
  MAX_CONSIDERED_CLUES,
  personClueNote,
} from "./notes";
import { buildPlayerView } from "./player-view";
import type { CodenamesReplayLog } from "./record";
import {
  agentsLeft,
  applyChat,
  applyClue,
  applyEndTurn,
  applyGuess,
  applyMark,
  applyTimeout,
  attachGuessNote,
  canChat,
  cleanTargets,
  clueProblemFor,
  createGame,
  currentSpymaster,
  currentTurn,
  guessersOf,
  guessesLeft,
  guessingIsAi,
  isAiSeat,
  legalActionsFor,
} from "./rules";
import { teamOf } from "./seating";
import {
  ChatActionSchema,
  type CodenamesAction,
  type CodenamesMachineEvent,
  type CodenamesPlayerView,
  type CodenamesResult,
  type CodenamesState,
  GiveClueActionSchema,
  type KeyEntry,
  type Team,
  type ViewPhase,
} from "./types";

// ---------------------------------------------------------------------------
// Codenames machine.
//
// The rules engine owns the phase (`state.phase`); the machine routes on it
// after every move and adds what the engine can't: AI turns, pacing and the
// optional timers. Chat and pointers are handled at `active` level so they
// flow in every phase without exiting (and cancelling) an AI call.
//
// SAFETY: every AI call races a deadline and is sanitized against the rules
// (a bad clue → the fallback clue; bad picks → a fallback pick), so a hung or
// hostile agent costs its team a weak turn, never wedges the session.
// ---------------------------------------------------------------------------

/** The Mastermind thinks at medium effort and test-reads four ideas: give it room. */
export const AI_CLUE_DEADLINE_MS = 90_000;
export const AI_GUESS_DEADLINE_MS = 45_000;

/** Resolve `run`, or `fallback()` when it throws or misses the deadline. */
export function raceWithFallback<T>(
  run: () => Promise<T>,
  fallback: () => T,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const settle = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => settle(fallback()), ms);
    Promise.resolve()
      .then(run)
      .then(settle, (err) => {
        if (!settled && typeof console !== "undefined") {
          console.error(`[${label}] AI agent failed; using fallback:`, err);
        }
        settle(fallback());
      });
  });
}

function resultFor(entry: KeyEntry, team: Team): PublicTurn["guesses"][number]["result"] {
  if (entry === "bystander" || entry === "assassin") return entry;
  return entry === team ? "own" : "opponent";
}

/**
 * The turns played so far, as the table saw them. `upToLive: false` leaves
 * out the turn in progress — an operative's history is what came BEFORE the
 * clue it is answering, or that clue reads as an "earlier, unfinished" one.
 */
function publicHistory(state: CodenamesState, team: Team, upToLive = true): PublicTurn[] {
  return (upToLive ? state.turns : state.turns.slice(0, -1))
    .filter((t) => t.clue !== null)
    .map((t) => ({
      by: t.team === team ? "us" : "them",
      clue: t.clue,
      guesses: t.guesses.map((g) => ({
        word: state.words[g.card] ?? "",
        result: resultFor(g.result, team),
      })),
    }));
}

/** The public history, plus the words this team's own clues were aimed at. */
function spymasterHistory(state: CodenamesState, team: Team): SpymasterTurn[] {
  const played = state.turns.filter((t) => t.clue !== null);
  return publicHistory(state, team).map((turn, i) => {
    const note = played[i]?.note;
    if (turn.by !== "us" || !note) return turn;
    return { ...turn, intended: note.targets.map((c) => state.words[c] ?? "") };
  });
}

export function buildClueInput(state: CodenamesState): ClueInput {
  const team = state.currentTeam;
  return {
    model: state.ai[currentSpymaster(state)] ?? DEFAULT_CODENAMES_MODEL,
    mode: "classic",
    language: state.language,
    cards: state.words.map((word, index) => {
      const entry = state.key[index] as KeyEntry;
      const kind =
        entry === "bystander" || entry === "assassin"
          ? entry
          : entry === team
            ? ("own" as const)
            : ("opponent" as const);
      return { index, word, kind, revealed: state.revealed[index] === true };
    }),
    history: spymasterHistory(state, team),
    agentsLeft: agentsLeft(state)[team],
    opponentAgentsLeft: agentsLeft(state)[team === 0 ? 1 : 0],
  };
}

/** The operative's input — built from public state only; the key never enters. */
export function buildGuessInput(state: CodenamesState): GuessInput {
  const team = state.currentTeam;
  const guesser = guessersOf(state, team)[0] ?? -1;
  const clue = currentTurn(state).clue ?? { word: "", count: 1 };
  return {
    model: state.ai[guesser] ?? DEFAULT_CODENAMES_MODEL,
    mode: "classic",
    language: state.language,
    words: state.words.flatMap((word, index) => (state.revealed[index] ? [] : [{ index, word }])),
    clue,
    guessesLeft: guessesLeft(state),
    agentsLeft: agentsLeft(state)[team],
    opponentAgentsLeft: agentsLeft(state)[team === 0 ? 1 : 0],
    history: publicHistory(state, team, false),
  };
}

/** A legal clue and what it meant, as the machine keeps it. */
export interface SettledClue {
  clue: Clue;
  note: ClueNote;
}

/** An AI operative's touches and its reading of the clue. */
export interface SettledPicks {
  picks: number[];
  note: GuessNote;
}

/** What the table looks like to the sanitizers. */
export interface TableShape {
  words: readonly string[];
  /** Still face down for this clue (Duet: not settled for this side). */
  faceDown: (card: number) => boolean;
  language: CodenamesState["language"];
}

const RawClueOutputSchema = z.object({
  word: z.string(),
  count: ClueCountSchema,
  targets: z.array(z.unknown()).optional(),
  reasoning: z.unknown().optional(),
  considered: z.array(z.unknown()).optional(),
  testRead: z.array(z.unknown()).nullable().optional(),
  links: z.array(z.unknown()).optional(),
  leftover: z.array(z.unknown()).optional(),
  standIn: z.boolean().optional(),
  cost: z.unknown().optional(),
  traceIds: z.unknown().optional(),
});

const RawLinkSchema = z.object({ card: z.number(), why: z.string() });

const RawConsideredSchema = z.object({
  word: z.string().trim().min(1),
  count: ClueCountSchema,
  targets: z.array(z.unknown()).optional(),
});

const RawGuessOutputSchema = z.object({
  picks: z.array(z.unknown()),
  notes: z.array(z.unknown()).optional(),
  reasoning: z.unknown().optional(),
  standIn: z.boolean().optional(),
  cost: z.unknown().optional(),
  traceIds: z.unknown().optional(),
});

const RawPickNoteSchema = z.object({
  card: z.number(),
  confidence: z.number().optional(),
  why: z.unknown().optional(),
});

function clueNoteOf(raw: z.infer<typeof RawClueOutputSchema>, table: TableShape): ClueNote {
  const considered = (raw.considered ?? []).flatMap((c) => {
    const parsed = RawConsideredSchema.safeParse(c);
    if (!parsed.success) return [];
    return [
      {
        word: cleanClueWord(parsed.data.word).slice(0, 30),
        count: parsed.data.count,
        targets: cleanCards(parsed.data.targets ?? [], table.faceDown).slice(0, 9),
      },
    ];
  });
  const targets = cleanCards(raw.targets ?? [], table.faceDown);
  const links = (raw.links ?? []).flatMap((l) => {
    const parsed = RawLinkSchema.safeParse(l);
    if (!parsed.success || !targets.includes(parsed.data.card)) return [];
    const why = cleanNoteText(parsed.data.why);
    return why ? [{ card: parsed.data.card, why: why.slice(0, 200) }] : [];
  });
  return {
    targets,
    links,
    leftover: cleanCards(raw.leftover ?? [], (c) => table.faceDown(c) && !targets.includes(c)),
    reasoning: cleanNoteText(raw.reasoning),
    considered: considered.slice(0, MAX_CONSIDERED_CLUES),
    testRead: raw.testRead ? cleanCards(raw.testRead, table.faceDown) : null,
    standIn: raw.standIn === true,
    cost: cleanCost(raw.cost),
    traceIds: cleanTraceIds(raw.traceIds),
  };
}

/** An agent's clue → a legal clue and its note, or the fallback's. */
export function settleClue(
  raw: unknown,
  table: TableShape,
  fallback: () => ClueOutput,
): SettledClue {
  const faceDownWords = table.words.filter((_, i) => table.faceDown(i));
  const parsed = RawClueOutputSchema.safeParse(raw);
  if (parsed.success && clueProblem(parsed.data.word, faceDownWords, table.language) === null) {
    return {
      clue: { word: cleanClueWord(parsed.data.word), count: parsed.data.count },
      note: clueNoteOf(parsed.data, table),
    };
  }
  const fb = fallback();
  return {
    clue: { word: fb.word, count: fb.count },
    note: clueNoteOf({ ...fb, standIn: true }, table),
  };
}

/** An agent's picks → distinct face-down cards within the guess limit (≥ 1), with its note. */
export function settlePicks(
  raw: unknown,
  faceDown: readonly number[],
  limit: number | null,
  fallback: () => GuessOutput,
): SettledPicks {
  const parsed = RawGuessOutputSchema.safeParse(raw);
  const open = (card: number) => faceDown.includes(card);
  let source: z.infer<typeof RawGuessOutputSchema> | GuessOutput | null = parsed.success
    ? parsed.data
    : null;
  let picks = source ? cleanCards(source.picks, open) : [];
  if (limit !== null) picks = picks.slice(0, limit);
  if (picks.length === 0) {
    source = { ...fallback(), standIn: true };
    picks = cleanCards(source.picks, open).slice(0, 1);
  }
  const notes = (source?.notes ?? []).flatMap((n) => {
    const p = RawPickNoteSchema.safeParse(n);
    return p.success ? [p.data] : [];
  });
  return {
    picks,
    note: {
      picks: picks.map((card) => {
        const n = notes.find((x) => x.card === card);
        const confidence =
          n?.confidence === undefined || !Number.isFinite(n.confidence)
            ? null
            : Math.min(1, Math.max(0, n.confidence));
        return { card, confidence, why: cleanNoteText(n?.why) };
      }),
      reasoning: cleanNoteText(source?.reasoning),
      standIn: source?.standIn === true,
      cost: cleanCost(source?.cost),
      traceIds: cleanTraceIds(source?.traceIds),
    },
  };
}

/** Table shape for classic: every face-down card. */
function classicTable(state: CodenamesState): TableShape {
  return {
    words: state.words,
    faceDown: (card) => state.revealed[card] === false,
    language: state.language,
  };
}

function aiActors(agent: CodenamesAiAgent) {
  return {
    computeClue: fromPromise(async ({ input }: { input: { state: CodenamesState } }) => {
      // Yield a macrotask so the server flushes the "thinking" state first.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const clueInput = buildClueInput(input.state);
      const fallback = () => fallbackClue(clueInput);
      const raw = await raceWithFallback<unknown>(
        () => agent.giveClue(clueInput),
        fallback,
        AI_CLUE_DEADLINE_MS,
        "codenames",
      );
      return settleClue(raw, classicTable(input.state), fallback);
    }),

    computeGuess: fromPromise(async ({ input }: { input: { state: CodenamesState } }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const guessInput = buildGuessInput(input.state);
      const fallback = () => fallbackGuess(guessInput);
      const raw = await raceWithFallback<unknown>(
        () => agent.guess(guessInput),
        fallback,
        AI_GUESS_DEADLINE_MS,
        "codenames",
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

const IDLE_STATE: CodenamesState = createGame({
  seed: 0,
  ai: [null, null, null, null],
  language: "en",
  clueTimerSec: 0,
  guessTimerSec: 0,
});

type ActionEvent = Extract<CodenamesMachineEvent, { type: "PLAYER_ACTION" }>;

function actionOf<K extends CodenamesAction["kind"]>(
  event: CodenamesMachineEvent,
  kind: K,
): (ActionEvent & { action: Extract<CodenamesAction, { kind: K }> }) | null {
  if (event.type !== "PLAYER_ACTION" || event.action.kind !== kind) return null;
  return event as ActionEvent & { action: Extract<CodenamesAction, { kind: K }> };
}

function msUntil(deadline: number | null): number {
  return deadline === null ? 0 : Math.max(0, deadline - Date.now());
}

export const codenamesMachine = setup({
  types: {} as { context: { game: CodenamesState }; events: CodenamesMachineEvent },

  delays: {
    aiStart: ({ context }) => context.game.beats.aiStart,
    aiGuess: ({ context }) => context.game.beats.aiGuess,
    // The deadline lives in the state (set once per phase), so re-entering
    // the waiting state after a guess resumes the same countdown.
    timeout: ({ context }) => msUntil(context.game.deadlineTs),
  },

  actors: aiActors(fallbackCodenamesAgent),

  guards: {
    isOver: ({ context }) => context.game.phase === "over",
    inClue: ({ context }) => context.game.phase === "clue",
    inGuessing: ({ context }) => context.game.phase === "guessing",
    spymasterIsAi: ({ context }) => isAiSeat(context.game, currentSpymaster(context.game)),
    guessersAreAi: ({ context }) => guessingIsAi(context.game),
    clueTimerOn: ({ context }) => context.game.clueTimerSec > 0,
    guessTimerOn: ({ context }) => context.game.guessTimerSec > 0,
    aiTurnDone: ({ context }) =>
      context.game.phase !== "guessing" || context.game.aiQueue.length === 0,
    isGiveClue: ({ context, event }) => {
      const e = actionOf(event, "give-clue");
      return e !== null && clueProblemFor(context.game, e.player, e.action.clue) === null;
    },
    isGuessMove: ({ event }) =>
      event.type === "PLAYER_ACTION" &&
      (event.action.kind === "guess" || event.action.kind === "end-turn"),
    isMark: ({ event }) => actionOf(event, "mark") !== null,
    isChat: ({ context, event }) => {
      const e = actionOf(event, "chat");
      return e !== null && canChat(context.game, e.player);
    },
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("codenames", () => ({
        game: createGame({
          seed: event.seed,
          ai: event.ai,
          language: event.language,
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
      return safeApply("codenames", () => ({
        game: applyClue(context.game, e.player, e.action.clue, note),
      }));
    }),

    applyGuessMove: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      const { action, player } = event;
      return safeApply("codenames", () => {
        if (action.kind === "guess") return { game: applyGuess(context.game, player, action.card) };
        if (action.kind === "end-turn") return { game: applyEndTurn(context.game, player) };
        return {};
      });
    }),

    applyMark: assign(({ context, event }) => {
      const e = actionOf(event, "mark");
      if (!e) return {};
      return safeApply("codenames", () => ({
        game: applyMark(context.game, e.player, e.action.card),
      }));
    }),

    appendChat: assign(({ context, event }) => {
      const e = actionOf(event, "chat");
      if (!e) return {};
      return safeApply("codenames", () => ({
        game: applyChat(context.game, e.player, e.action.text),
      }));
    }),

    markSpymasterThinking: assign(({ context }) => ({
      game: { ...context.game, aiThinking: currentSpymaster(context.game) },
    })),

    markGuesserThinking: assign(({ context }) => ({
      game: {
        ...context.game,
        aiThinking: guessersOf(context.game, context.game.currentTeam)[0] ?? null,
      },
    })),

    clearThinking: assign(({ context }) => ({ game: { ...context.game, aiThinking: null } })),

    recordAiClue: assign(({ context, event }) => {
      const output = (event as { output?: Partial<SettledClue> }).output;
      const game = context.game;
      const seat = currentSpymaster(game);
      const fallback = () => fallbackClue(buildClueInput(game));
      // Re-checked: the board can't have changed, but the rules have the last word.
      const settled = settleClue(
        output?.clue ? { ...output.clue, ...output.note } : null,
        classicTable(game),
        fallback,
      );
      return safeApply("codenames", () => ({
        game: applyClue(game, seat, settled.clue, settled.note),
      }));
    }),

    recordFallbackClue: assign(({ context }) => {
      const game = context.game;
      const settled = settleClue(null, classicTable(game), () =>
        fallbackClue(buildClueInput(game)),
      );
      return safeApply("codenames", () => ({
        game: applyClue(game, currentSpymaster(game), settled.clue, settled.note),
      }));
    }),

    queueAiPicks: assign(({ context, event }) => {
      const output = (event as { output?: SettledPicks }).output;
      const game = { ...context.game, aiQueue: [...(output?.picks ?? [])], aiThinking: null };
      return { game: output ? attachGuessNote(game, output.note) : game };
    }),

    queueFallbackPicks: assign(({ context }) => {
      const input = buildGuessInput(context.game);
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
      const seat = guessersOf(game, game.currentTeam)[0];
      if (card === undefined || seat === undefined) return {};
      const rest = { ...game, aiQueue: game.aiQueue.slice(1) };
      return safeApply("codenames", () => ({ game: applyGuess(rest, seat, card) }));
    }),

    // An AI team that ran out of picks without a miss stops on its own.
    stopAiTurn: assign(({ context }) => {
      const game = context.game;
      const seat = guessersOf(game, game.currentTeam)[0];
      if (game.phase !== "guessing" || seat === undefined) return {};
      if (currentTurn(game).guesses.length === 0) return {};
      return safeApply("codenames", () => ({ game: applyEndTurn(game, seat) }));
    }),
  },
}).createMachine({
  id: "codenames",
  initial: "idle",
  context: { game: IDLE_STATE },

  states: {
    idle: {
      on: { START: { target: "active", actions: "initGame" } },
    },

    active: {
      initial: "route",
      on: {
        PLAYER_ACTION: [
          { guard: "isChat", actions: "appendChat" },
          { guard: "isMark", actions: "applyMark" },
        ],
        START: { target: "active", actions: "initGame" },
        RESET: { target: "idle" },
      },

      states: {
        route: {
          always: [
            { guard: "isOver", target: "#codenames.gameOver" },
            { guard: "inClue", target: "clue" },
            { guard: "inGuessing", target: "guessing" },
            { target: "#codenames.gameOver" },
          ],
        },

        clue: {
          initial: "decide",
          states: {
            decide: {
              always: [
                { guard: "spymasterIsAi", target: "aiWaiting" },
                // Armed on the way in, so the `timeout` delay reads the deadline.
                { guard: "clueTimerOn", target: "timed", actions: "armClueTimer" },
                { target: "waiting" },
              ],
            },
            waiting: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGiveClue",
                  actions: "applyClue",
                  target: "#codenames.active.route",
                },
              },
            },
            timed: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGiveClue",
                  actions: "applyClue",
                  target: "#codenames.active.route",
                },
              },
              after: { timeout: { actions: "timeOut", target: "#codenames.active.route" } },
            },
            aiWaiting: {
              entry: "markSpymasterThinking",
              after: { aiStart: { target: "aiCalling" } },
            },
            aiCalling: {
              invoke: {
                src: "computeClue",
                input: ({ context }) => ({ state: context.game }),
                onDone: {
                  actions: ["clearThinking", "recordAiClue"],
                  target: "#codenames.active.route",
                },
                onError: {
                  actions: ["clearThinking", "recordFallbackClue"],
                  target: "#codenames.active.route",
                },
              },
            },
          },
        },

        guessing: {
          initial: "decide",
          states: {
            decide: {
              always: [
                { guard: "guessersAreAi", target: "aiWaiting" },
                { guard: "guessTimerOn", target: "timed", actions: "armGuessTimer" },
                { target: "waiting" },
              ],
            },
            waiting: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGuessMove",
                  actions: "applyGuessMove",
                  target: "#codenames.active.route",
                },
              },
            },
            timed: {
              on: {
                PLAYER_ACTION: {
                  guard: "isGuessMove",
                  actions: "applyGuessMove",
                  target: "#codenames.active.route",
                },
              },
              after: { timeout: { actions: "timeOut", target: "#codenames.active.route" } },
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
              always: {
                guard: "aiTurnDone",
                actions: "stopAiTurn",
                target: "#codenames.active.route",
              },
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

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

type CodenamesSnapshot = SnapshotFrom<typeof codenamesMachine>;

export function phaseOf(snapshot: CodenamesSnapshot): ViewPhase {
  if (snapshot.matches("idle")) return "idle";
  if (snapshot.matches("gameOver")) return "over";
  return snapshot.context.game.phase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEvent(player: number, action: CodenamesAction): CodenamesMachineEvent {
  return { type: "PLAYER_ACTION", player, action };
}

function validateCodenamesAction(
  snapshot: CodenamesSnapshot,
  player: number,
  raw: unknown,
): ActionValidation<CodenamesMachineEvent> {
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
    if (!canChat(game, player)) return rejectAction("spymasters can't talk to their team");
    return acceptAction(toEvent(player, { kind: "chat", text: parsed.value.text }));
  }

  // Enumerable moves: the client may only pick one the engine offered, and
  // the event is rebuilt from the engine's own object.
  const legal = legalActionsFor(game, player);
  if (legal.length === 0) return rejectAction("you have no moves right now");
  const match = matchLegalAction(legal, raw.action);
  if (match === undefined) return rejectAction("that move isn't legal right now");
  return acceptAction(toEvent(player, match));
}

/** The machine with its AI seats bound to `agent` — how the server gives each session its model. */
export function withCodenamesAgent(agent: CodenamesAiAgent): typeof codenamesMachine {
  return codenamesMachine.provide({ actors: aiActors(agent) });
}

export const codenamesSpec: GameMachineSpec<
  typeof codenamesMachine,
  CodenamesPlayerView,
  CodenamesAction,
  CodenamesResult,
  CodenamesConfig
> = {
  machine: codenamesMachine,
  manifest: codenamesManifest,

  buildStart: ({ seats, config, seed }) => ({
    type: "START",
    seed,
    ai: seatStrategies(seats),
    language: config.language,
    clueTimerSec: config.clueTimerSec,
    guessTimerSec: config.guessTimerSec,
  }),

  getPlayerView(snapshot, player) {
    return buildPlayerView(snapshot.context.game, phaseOf(snapshot), player);
  },

  getLegalActions(snapshot, player) {
    if (!snapshot.matches("active")) return [];
    return legalActionsFor(snapshot.context.game, player);
  },

  validateAction: validateCodenamesAction,

  // -1 throughout: several operatives may guess, and chat and pointers flow
  // from any seat at any time — a single active player would make the
  // server's turn check reject them.
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
      kind: "teams",
      teamOf: Array.from({ length: game.seatCount }, (_, seat) => teamOf(seat)),
      winningTeam: game.result.winner,
      teamScores: [...game.result.agentsFound],
    };
  },

  getReplayLog(snapshot): CodenamesReplayLog | null {
    const game = snapshot.context.game;
    // Null until game over — a mid-game persist must never leak the key.
    if (!snapshot.matches("gameOver") || game.result === null) return null;
    return {
      formatVersion: 1,
      seed: game.seed,
      language: game.language,
      seatCount: game.seatCount,
      ai: [...game.ai],
      words: [...game.words],
      key: [...game.key],
      startingTeam: game.startingTeam,
      turns: game.turns.map((t) => ({ ...t, guesses: [...t.guesses] })),
      result: game.result,
      aiCost: aiCostOf(game.turns),
    };
  },
};
