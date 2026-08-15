import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { createRng, randomSeed } from "../../lib/rng";
import {
  type ActionValidation,
  acceptAction,
  matchLegalAction,
  parseActionSync,
  rejectAction,
  safeApply,
} from "../../machines/action-validation";
import type { GameMachineSpec } from "../../machines/types";
import type { EncryptInput, GuessInput } from "./ai/agent";
import { getDecryptoAgent } from "./ai/agent";
import { fallbackGuess } from "./ai/fallback";
import { DEFAULT_DECRYPTO_MODEL } from "./ai/models";
import { buildPlayerView } from "./player-view";
import {
  allCluesDone,
  allGuessesDone,
  applyChat,
  applyDraft,
  applyGuess,
  applySubmitClues,
  buildRoundTransmissions,
  buildTeams,
  chatAllowed,
  checkClueLegality,
  codesEqual,
  currentTransmission,
  decodeMistakesFor,
  defaultTeamPlayers,
  eligibleSeats,
  evaluateRoundEnd,
  guessDrivenByAi,
  isAiSeat,
  isValidCode,
  legalActionsFor,
  pendingClueTransmissions,
  pendingGuessPurposes,
  playerCount,
  resolveTransmission,
  revealedCluesFor,
} from "./rules";
import type {
  Code,
  DecryptoAction,
  DecryptoContext,
  DecryptoMachineEvent,
  DecryptoPlayerView,
  DecryptoResult,
  DecryptoViewPhase,
  GuessPurpose,
  Team,
  Transmission,
} from "./types";
import { ChatActionSchema, DEFAULT_BEATS, MAX_CLUE_LENGTH, SubmitCluesActionSchema } from "./types";

// ---------------------------------------------------------------------------
// Decrypto machine.
//
// Simultaneous phases are sushi-go-style parallel states: an `input` region
// (internal transitions for human events — they must never exit the state
// hosting the sibling region's invoke, or the in-flight LLM promise would be
// cancelled) and an `ai` region whose fromPromise actor Promise.alls every
// pending GPT decision. Both regions reach `final` → `onDone` advances.
//
// SAFETY: there is no server watchdog around AI moves, so every actor call is
// raced against a deadline and a deterministic fallback, then sanitized to an
// always-applicable result — a hung or hostile agent can cost its team the
// round, never wedge the session. Guards key on committed/skipped flags that
// the commit actions set unconditionally, never on "did the apply succeed"
// (the sky-team thinking-loop failure mode).
// ---------------------------------------------------------------------------

/**
 * Per-decision budgets for an injected agent. Sized for a frontier model at
 * medium reasoning effort — encrypt is the heavyweight task (~40-80s on
 * gpt-5.5); the server agent's own call budgets sit below these. When an
 * encrypt still misses its deadline (or throws, or returns illegal clues
 * twice), the transmission is SKIPPED like a timer expiry — an honest
 * miscommunication token — rather than published as garbage clues nobody
 * should be asked to decode or intercept.
 */
export const AI_ENCRYPT_DEADLINE_MS = 120_000;
export const AI_GUESS_DEADLINE_MS = 60_000;

function raceWithFallback<T>(run: () => Promise<T>, fallback: () => T, ms: number): Promise<T> {
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
          console.error("[decrypto] AI agent failed; using fallback:", err);
        }
        settle(fallback());
      });
  });
}

/** Like raceWithFallback but resolves null on timeout or error — "no answer". */
function raceOrNull<T>(run: () => Promise<T>, ms: number): Promise<T | null> {
  return raceWithFallback<T | null>(run, () => null, ms);
}

function modelForSeat(ctx: DecryptoContext, seat: number): string {
  return ctx.aiModels[seat] ?? DEFAULT_DECRYPTO_MODEL;
}

function buildEncryptInput(ctx: DecryptoContext, tx: Transmission): EncryptInput {
  const team = ctx.teams[tx.team];
  const opponent = ctx.teams[(1 - tx.team) as Team];
  return {
    model: modelForSeat(ctx, tx.encryptor),
    // The encrypting team always has keywords; the null case is the
    // interceptor pseudo-team, which never encrypts.
    keywords: (team.keywords ?? ["", "", "", ""]) as EncryptInput["keywords"],
    code: [...tx.code] as Code,
    round: ctx.round,
    ownRevealedClues: revealedCluesFor(ctx, tx.team),
    oppRevealedClues: revealedCluesFor(ctx, (1 - tx.team) as Team),
    forbiddenClues: [...team.usedClues],
    ownDecodeMistakes: decodeMistakesFor(ctx, tx.team),
    tokens: {
      own: { interceptions: team.interceptions, miscommunications: team.miscommunications },
      opp: {
        interceptions: opponent.interceptions,
        miscommunications: opponent.miscommunications,
      },
    },
  };
}

function buildGuessInput(
  ctx: DecryptoContext,
  tx: Transmission,
  purpose: GuessPurpose,
): GuessInput {
  const seat = eligibleSeats(ctx, tx, purpose)[0] ?? tx.encryptor;
  return {
    model: modelForSeat(ctx, seat),
    purpose,
    // Type-level redaction: intercepts NEVER receive the encrypting team's keywords.
    keywords: purpose === "decode" ? ctx.teams[tx.team].keywords : null,
    currentClues: [...(tx.clues ?? ["", "", ""])] as GuessInput["currentClues"],
    targetRevealedClues: revealedCluesFor(ctx, tx.team),
    pastDecodeMistakes: purpose === "decode" ? decodeMistakesFor(ctx, tx.team) : [],
    round: ctx.round,
  };
}

/** AI clue output → legal clue triple, or null (→ the transmission is skipped). */
function sanitizeCluesOrNull(
  ctx: DecryptoContext,
  tx: Transmission,
  raw: unknown,
): [string, string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const clues = raw.map((c) => (typeof c === "string" ? c.trim().slice(0, MAX_CLUE_LENGTH) : ""));
  const triple = clues as [string, string, string];
  const team = ctx.teams[tx.team];
  const legality = checkClueLegality(team.keywords, team.usedClues, triple);
  return legality.ok ? triple : null;
}

function sanitizeGuess(
  ctx: DecryptoContext,
  tx: Transmission,
  purpose: GuessPurpose,
  raw: unknown,
): Code {
  if (isValidCode(raw)) return [...raw] as Code;
  return fallbackGuess(buildGuessInput(ctx, tx, purpose));
}

function pendingAiClueTransmissions(ctx: DecryptoContext): Transmission[] {
  return pendingClueTransmissions(ctx).filter((t) => isAiSeat(ctx, t.encryptor));
}

function pendingAiGuessPurposes(ctx: DecryptoContext): GuessPurpose[] {
  const tx = currentTransmission(ctx);
  if (!tx) return [];
  return pendingGuessPurposes(tx).filter((purpose) => guessDrivenByAi(ctx, tx, purpose));
}

interface AiClueResult {
  team: Team;
  /** Null = the agent failed to produce legal clues in time → skip the transmission. */
  clues: [string, string, string] | null;
}

interface AiGuessResult {
  purpose: GuessPurpose;
  code: Code;
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const initialContext: DecryptoContext = {
  variant: "standard",
  timerEnabled: false,
  seed: 0,
  rng: () => 0,
  humanPlayers: [0],
  aiModels: [],
  teams: [
    { players: [0, 1], keywords: null, interceptions: 0, miscommunications: 0, usedClues: [] },
    { players: [2, 3], keywords: null, interceptions: 0, miscommunications: 0, usedClues: [] },
  ],
  round: 0,
  current: [],
  txIdx: 0,
  clueTimerDeadlineTs: null,
  chat: [],
  history: [],
  result: null,
  beats: DEFAULT_BEATS,
};

export const decryptoMachine = setup({
  types: {} as {
    context: DecryptoContext;
    events: DecryptoMachineEvent;
  },

  delays: {
    roundStartBeat: ({ context }) => context.beats.roundStart,
    aiBeat: ({ context }) => context.beats.aiBeat,
    // A token-awarding reveal (interception / miscommunication) holds three
    // beats so the digit-by-digit breakdown can actually be read; a clean
    // transmission moves on after one. Derived from the guesses rather than
    // `resolved` so evaluation order vs the entry action can't bite.
    revealBeat: ({ context }) => {
      const tx = currentTransmission(context);
      if (!tx) return context.beats.reveal;
      const intercepted = tx.interceptRequired && codesEqual(tx.interceptGuess, tx.code);
      const miscommunicated = tx.skipped || !codesEqual(tx.decodeGuess, tx.code);
      return context.beats.reveal * (intercepted || miscommunicated ? 3 : 1);
    },
    roundEndBeat: ({ context }) => context.beats.roundEnd,
    clueTimeout: ({ context }) => context.beats.clueTimeout,
  },

  actors: {
    computeAiClues: fromPromise(
      async ({ input }: { input: { ctx: DecryptoContext } }): Promise<AiClueResult[]> => {
        // Yield a macrotask so the server flushes the pending state update
        // (and its ai-thinking broadcast) before any synchronous agent work.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const ctx = input.ctx;
        return Promise.all(
          pendingAiClueTransmissions(ctx).map(async (tx) => {
            const encryptInput = buildEncryptInput(ctx, tx);
            const raw = await raceOrNull(
              () => getDecryptoAgent().encrypt(encryptInput),
              AI_ENCRYPT_DEADLINE_MS,
            );
            return {
              team: tx.team,
              clues: raw === null ? null : sanitizeCluesOrNull(ctx, tx, raw),
            };
          }),
        );
      },
    ),

    computeAiGuesses: fromPromise(
      async ({ input }: { input: { ctx: DecryptoContext } }): Promise<AiGuessResult[]> => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const ctx = input.ctx;
        const tx = currentTransmission(ctx);
        if (!tx) return [];
        return Promise.all(
          pendingAiGuessPurposes(ctx).map(async (purpose) => {
            const guessInput = buildGuessInput(ctx, tx, purpose);
            const raw = await raceWithFallback(
              () => getDecryptoAgent().guess(guessInput),
              () => fallbackGuess(guessInput),
              AI_GUESS_DEADLINE_MS,
            );
            return { purpose, code: sanitizeGuess(ctx, tx, purpose, raw) };
          }),
        );
      },
    ),
  },

  guards: {
    gameDecided: ({ context }) => context.result !== null,
    allCluesDone: ({ context }) => allCluesDone(context),
    noAiCluesPending: ({ context }) => pendingAiClueTransmissions(context).length === 0,
    allGuessesDone: ({ context }) => {
      const tx = currentTransmission(context);
      return tx === null || allGuessesDone(tx);
    },
    noAiGuessesPending: ({ context }) => pendingAiGuessPurposes(context).length === 0,
    hasNextTransmission: ({ context }) => context.txIdx + 1 < context.current.length,
    // The 30s timer arms only in the two-team game, only when exactly one
    // encryptor is still writing, and only when that encryptor is HUMAN — an
    // AI seat's own deadline must never hand its team an auto-miscommunication.
    timerShouldArm: ({ context }) => {
      if (!context.timerEnabled || context.current.length !== 2) return false;
      const pending = pendingClueTransmissions(context);
      return pending.length === 1 && !isAiSeat(context, (pending[0] as Transmission).encryptor);
    },
    isSubmitClues: ({ context, event }) =>
      event.type === "PLAYER_ACTION" &&
      event.action.kind === "submit-clues" &&
      pendingClueTransmissions(context).some((t) => t.encryptor === event.player),
    isGuessAction: ({ event }) =>
      event.type === "PLAYER_ACTION" &&
      (event.action.kind === "set-draft" || event.action.kind === "submit-guess"),
    isChat: ({ context, event }) =>
      event.type === "PLAYER_ACTION" &&
      event.action.kind === "chat" &&
      chatAllowed(context, event.player),
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("decrypto", () => {
        const variant: DecryptoContext["variant"] =
          event.variant === "interceptor" ? "interceptor" : "standard";
        const seats = playerCount(variant);
        const seed = event.seed ?? randomSeed();
        const rng = createRng(seed);
        const humanPlayers = (event.humanPlayers ?? [0]).filter(
          (p) => Number.isInteger(p) && p >= 0 && p < seats,
        );
        const aiModels = Array.from({ length: seats }, (_, i) => {
          if (humanPlayers.includes(i)) return null;
          const model = event.aiModels?.[i];
          return typeof model === "string" && model.length > 0 && model.length <= 64
            ? model
            : DEFAULT_DECRYPTO_MODEL;
        });
        return {
          variant,
          timerEnabled: event.timerEnabled === true,
          seed,
          rng,
          humanPlayers,
          aiModels,
          teams: buildTeams({ variant, teamPlayers: defaultTeamPlayers(variant), rng }),
          round: 0,
          current: [],
          txIdx: 0,
          clueTimerDeadlineTs: null,
          chat: [],
          history: [],
          result: null,
          beats: { ...DEFAULT_BEATS, ...event.beats },
        };
      });
    }),

    beginRound: assign(({ context }) => {
      const round = context.round + 1;
      return {
        round,
        txIdx: 0,
        clueTimerDeadlineTs: null,
        current: buildRoundTransmissions({ ...context, round }, round),
      };
    }),

    applySubmitClues: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION" || event.action.kind !== "submit-clues") return {};
      const clues = event.action.clues;
      return safeApply("decrypto", () => applySubmitClues(context, event.player, clues));
    }),

    applyGuessAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      const action = event.action;
      return safeApply("decrypto", () => {
        if (action.kind === "set-draft") {
          return applyDraft(context, event.player, action.purpose, action.slot, action.digit);
        }
        if (action.kind === "submit-guess") {
          return applyGuess(context, event.player, action.purpose, action.code);
        }
        return {};
      });
    }),

    appendChat: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION" || event.action.kind !== "chat") return {};
      const text = event.action.text;
      return safeApply("decrypto", () => applyChat(context, event.player, text));
    }),

    setClueDeadline: assign(({ context }) => ({
      clueTimerDeadlineTs: Date.now() + context.beats.clueTimeout,
    })),

    skipLateTransmission: assign(({ context }) => ({
      clueTimerDeadlineTs: null,
      current: context.current.map((t) =>
        !t.skipped && t.clues === null ? { ...t, skipped: true, skipReason: "timer" as const } : t,
      ),
    })),

    clearClueDeadline: assign({ clueTimerDeadlineTs: null }),

    recordAiClues: assign(({ context, event }) => {
      const output = (event as { output?: AiClueResult[] }).output ?? [];
      let patch: DecryptoContext = context;
      for (const item of output) {
        const idx = patch.current.findIndex(
          (t) => t.team === item.team && !t.skipped && t.clues === null,
        );
        const tx = patch.current[idx];
        if (!tx) continue; // skipped or already recorded — late result no-ops
        if (item.clues === null) {
          // The agent failed to produce legal clues in time: skip the
          // transmission like a timer expiry (honest miscommunication) rather
          // than publishing noise for humans to "decode".
          patch = {
            ...patch,
            current: patch.current.map((t, i) =>
              i === idx ? { ...t, skipped: true, skipReason: "ai" as const } : t,
            ),
          };
          continue;
        }
        try {
          patch = { ...patch, ...applySubmitClues(patch, tx.encryptor, item.clues) };
        } catch {
          // Sanitized upstream; an illegal item here means the context moved on.
        }
      }
      return { current: patch.current, teams: patch.teams };
    }),

    // onError belt — the actor is built to always resolve, but if it ever
    // rejects, skip every pending AI transmission so the barrier completes.
    recordFallbackClues: assign(({ context }) => {
      const pendingTeams = new Set(pendingAiClueTransmissions(context).map((t) => t.team));
      return {
        current: context.current.map((t) =>
          pendingTeams.has(t.team) && !t.skipped && t.clues === null
            ? { ...t, skipped: true, skipReason: "ai" as const }
            : t,
        ),
      };
    }),

    commitAiGuesses: assign(({ context, event }) => {
      const output = (event as { output?: AiGuessResult[] }).output ?? [];
      let patch: DecryptoContext = context;
      const tx = currentTransmission(patch);
      if (!tx) return {};
      for (const item of output) {
        const seat = eligibleSeats(patch, tx, item.purpose)[0];
        if (seat === undefined) continue;
        try {
          patch = { ...patch, ...applyGuess(patch, seat, item.purpose, item.code) };
        } catch {
          // already committed / no longer applicable — first commit wins
        }
      }
      return { current: patch.current };
    }),

    commitFallbackGuesses: assign(({ context }) => {
      let patch: DecryptoContext = context;
      const tx = currentTransmission(patch);
      if (!tx) return {};
      for (const purpose of pendingAiGuessPurposes(patch)) {
        const seat = eligibleSeats(patch, tx, purpose)[0];
        if (seat === undefined) continue;
        try {
          const code = fallbackGuess(buildGuessInput(patch, tx, purpose));
          patch = { ...patch, ...applyGuess(patch, seat, purpose, code) };
        } catch {
          // unreachable by construction
        }
      }
      return { current: patch.current };
    }),

    resolveCurrentTransmission: assign(({ context }) => {
      return safeApply("decrypto", () => resolveTransmission(context));
    }),

    advanceTransmission: assign(({ context }) => ({ txIdx: context.txIdx + 1 })),

    // Moves the round into history and clears `current` (revealedCluesFor
    // scans both, so leaving it would double-count the note sheet).
    finalizeRound: assign(({ context }) => ({
      history: [...context.history, { round: context.round, transmissions: context.current }],
      current: [],
      txIdx: 0,
      result: evaluateRoundEnd(context),
    })),
  },
}).createMachine({
  id: "decrypto",
  initial: "idle",
  context: initialContext,

  states: {
    idle: {
      on: { START: { target: "active", actions: "initGame" } },
    },

    active: {
      initial: "roundStart",

      // Team chat flows in every in-game phase; the guard enforces the
      // encryptor lockout. Unhandled PLAYER_ACTIONs bubble here and drop.
      on: {
        PLAYER_ACTION: { guard: "isChat", actions: "appendChat" },
        START: { target: "active", actions: "initGame" },
        RESET: { target: "idle" },
      },

      states: {
        roundStart: {
          entry: "beginRound",
          after: { roundStartBeat: { target: "clueWriting" } },
        },

        clueWriting: {
          type: "parallel",
          onDone: { target: "resolving" },
          states: {
            input: {
              initial: "fresh",
              on: {
                // Internal (no target): must not exit the parallel state and
                // cancel the sibling region's in-flight LLM invoke.
                PLAYER_ACTION: { guard: "isSubmitClues", actions: "applySubmitClues" },
              },
              states: {
                fresh: {
                  always: [
                    { guard: "allCluesDone", target: "done" },
                    { guard: "timerShouldArm", target: "timed" },
                  ],
                },
                timed: {
                  entry: "setClueDeadline",
                  always: { guard: "allCluesDone", target: "done" },
                  after: {
                    clueTimeout: { target: "done", actions: "skipLateTransmission" },
                  },
                },
                done: { type: "final", entry: "clearClueDeadline" },
              },
            },
            ai: {
              initial: "maybeThinking",
              states: {
                maybeThinking: {
                  always: { guard: "noAiCluesPending", target: "aiDone" },
                  after: { aiBeat: { target: "computing" } },
                },
                computing: {
                  invoke: {
                    src: "computeAiClues",
                    input: ({ context }) => ({ ctx: context }),
                    onDone: { target: "maybeThinking", actions: "recordAiClues" },
                    onError: { target: "maybeThinking", actions: "recordFallbackClues" },
                  },
                },
                aiDone: { type: "final" },
              },
            },
          },
        },

        // Sequential White-then-Black resolution of `current[txIdx]`.
        resolving: {
          initial: "guessing",
          states: {
            guessing: {
              type: "parallel",
              onDone: { target: "reveal" },
              states: {
                input: {
                  initial: "open",
                  on: {
                    PLAYER_ACTION: { guard: "isGuessAction", actions: "applyGuessAction" },
                  },
                  states: {
                    open: {
                      always: { guard: "allGuessesDone", target: "done" },
                    },
                    done: { type: "final" },
                  },
                },
                ai: {
                  initial: "maybeThinking",
                  states: {
                    maybeThinking: {
                      always: { guard: "noAiGuessesPending", target: "aiDone" },
                      after: { aiBeat: { target: "computing" } },
                    },
                    computing: {
                      invoke: {
                        src: "computeAiGuesses",
                        input: ({ context }) => ({ ctx: context }),
                        onDone: { target: "maybeThinking", actions: "commitAiGuesses" },
                        onError: { target: "maybeThinking", actions: "commitFallbackGuesses" },
                      },
                    },
                    aiDone: { type: "final" },
                  },
                },
              },
            },

            reveal: {
              entry: "resolveCurrentTransmission",
              after: {
                revealBeat: [
                  {
                    guard: "hasNextTransmission",
                    target: "guessing",
                    actions: "advanceTransmission",
                  },
                  { target: "#decrypto.active.roundEnd" },
                ],
              },
            },
          },
        },

        // Win/loss is evaluated ONLY here — tokens from both transmissions of
        // the round count together, and the simultaneous-threshold cases fall
        // through to the points tiebreak inside evaluateRoundEnd.
        roundEnd: {
          entry: "finalizeRound",
          after: {
            roundEndBeat: [
              { guard: "gameDecided", target: "#decrypto.gameOver" },
              { target: "roundStart" },
            ],
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

type DecryptoSnapshot = SnapshotFrom<typeof decryptoMachine>;

export function phaseOf(snapshot: DecryptoSnapshot): DecryptoViewPhase {
  const value = snapshot.value as string | Record<string, unknown>;
  if (value === "idle") return "idle";
  if (value === "gameOver") return "gameOver";
  if (typeof value === "object" && value !== null && "active" in value) {
    const active = (value as { active: unknown }).active;
    if (active === "roundStart") return "roundStart";
    if (active === "roundEnd") return "roundEnd";
    if (typeof active === "object" && active !== null) {
      if ("clueWriting" in active) return "clueWriting";
      if ("resolving" in active) {
        const resolving = (active as { resolving: unknown }).resolving;
        return resolving === "reveal" ? "reveal" : "guessing";
      }
    }
  }
  return "idle";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEvent(player: number, action: DecryptoAction): DecryptoMachineEvent {
  return { type: "PLAYER_ACTION", player, action };
}

function validateDecryptoAction(
  snapshot: DecryptoSnapshot,
  player: number,
  raw: unknown,
): ActionValidation<DecryptoMachineEvent> {
  if (!isRecord(raw)) return rejectAction("action must be an object");
  if (raw.type !== "PLAYER_ACTION") {
    return rejectAction(`unsupported action type "${String(raw.type)}"`);
  }
  if (!isRecord(raw.action)) {
    return rejectAction("PLAYER_ACTION is missing its `action` payload");
  }

  const ctx = snapshot.context;
  const phase = phaseOf(snapshot);
  const kind = raw.action.kind;

  if (kind === "submit-clues") {
    const parsed = parseActionSync(SubmitCluesActionSchema, raw.action);
    if (!parsed.ok) return rejectAction(parsed.reason);
    if (phase !== "clueWriting") return rejectAction("clues can't be submitted right now");
    const tx = pendingClueTransmissions(ctx).find((t) => t.encryptor === player);
    if (!tx) return rejectAction("you have no clues to give right now");
    const team = ctx.teams[tx.team];
    const legality = checkClueLegality(team.keywords, team.usedClues, parsed.value.clues);
    if (!legality.ok) return rejectAction(legality.reason);
    return acceptAction(toEvent(player, { kind: "submit-clues", clues: parsed.value.clues }));
  }

  if (kind === "chat") {
    const parsed = parseActionSync(ChatActionSchema, raw.action);
    if (!parsed.ok) return rejectAction(parsed.reason);
    if (phase === "idle" || phase === "gameOver") {
      return rejectAction("chat is only available during a game");
    }
    if (!chatAllowed(ctx, player)) {
      return rejectAction("the encryptor can't talk to their team until their code is revealed");
    }
    return acceptAction(toEvent(player, { kind: "chat", text: parsed.value.text }));
  }

  // Enumerable actions: the client may only pick a move the engine offered,
  // and the event is rebuilt from the engine's own object.
  const legal = legalActionsFor(ctx, phase, player);
  if (legal.length === 0) return rejectAction("you have no legal actions right now");
  const match = matchLegalAction(legal, raw.action);
  if (match === undefined) return rejectAction("that action is not legal in the current state");
  return acceptAction(toEvent(player, match));
}

interface DecryptoReplayLog {
  variant: DecryptoContext["variant"];
  seed: number;
  keywords: [string[] | null, string[] | null];
  rounds: DecryptoContext["history"];
  chat: DecryptoContext["chat"];
  result: DecryptoResult;
  playerCount: number;
  scores: [number, number];
  /** Duplicated into scoreA/scoreB — persistReplay's summary columns read those names. */
  scoreA: number;
  scoreB: number;
  winner?: Team;
}

export const decryptoSpec: GameMachineSpec<
  typeof decryptoMachine,
  DecryptoPlayerView,
  DecryptoAction,
  DecryptoResult
> = {
  machine: decryptoMachine,

  getPlayerView(snapshot, player) {
    return buildPlayerView(snapshot.context, phaseOf(snapshot), player);
  },

  getLegalActions(snapshot, player) {
    return legalActionsFor(snapshot.context, phaseOf(snapshot), player);
  },

  validateAction(snapshot, player, raw) {
    return validateDecryptoAction(snapshot, player, raw);
  },

  // -1 in every in-game phase: clue-writing and guessing are simultaneous,
  // and team chat / drafts must flow from any seat at any time — a single
  // "active player" would make the server's turn validation reject them.
  getActivePlayer(snapshot) {
    return phaseOf(snapshot) === "idle" ? 0 : -1;
  },

  getResult(snapshot) {
    return snapshot.context.result;
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getReplayLog(snapshot): DecryptoReplayLog | null {
    const ctx = snapshot.context;
    // Null until game over — a mid-game persist must never leak keywords.
    if (!snapshot.matches("gameOver") || ctx.result === null) return null;
    return {
      variant: ctx.variant,
      seed: ctx.seed,
      keywords: [
        ctx.teams[0].keywords ? [...ctx.teams[0].keywords] : null,
        ctx.teams[1].keywords ? [...ctx.teams[1].keywords] : null,
      ],
      rounds: ctx.history,
      chat: ctx.chat,
      result: ctx.result,
      playerCount: playerCount(ctx.variant),
      scores: ctx.result.points,
      scoreA: ctx.result.points[0],
      scoreB: ctx.result.points[1],
      winner: ctx.result.winner,
    };
  },
};
