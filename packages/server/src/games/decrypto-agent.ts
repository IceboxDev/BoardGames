import type {
  DecryptoAiAgent,
  EncryptInput,
  GuessInput,
} from "@boardgames/core/games/decrypto/ai/agent";
import { fallbackClues, fallbackGuess } from "@boardgames/core/games/decrypto/ai/fallback";
import {
  canonicalDecryptoModel,
  DEFAULT_DECRYPTO_MODEL,
} from "@boardgames/core/games/decrypto/ai/models";
import {
  type ClueNote,
  type GuessNote,
  noteText,
  STAND_IN_CLUE_NOTE,
  standInGuessNote,
} from "@boardgames/core/games/decrypto/notes";
import { checkClueLegality, isValidCode } from "@boardgames/core/games/decrypto/rules";
import type { Code } from "@boardgames/core/games/decrypto/types";
import { type AiRole, causeChain, structuredGenerate, tierModel } from "../lib/ai";
import { mastermindEncryptNoted, mastermindGuessNoted } from "./decrypto-mastermind";
import {
  decodeSystem,
  ENCRYPT_JSON_SCHEMA,
  encryptSystem,
  encryptUser,
  GUESS_JSON_SCHEMA,
  guessUser,
  interceptSystem,
  RawEncryptSchema,
  RawGuessSchema,
} from "./decrypto-prompts";

/**
 * LLM-backed Decrypto agent. Bound to each new session's machine while AI is
 * available (see `games/registry.ts`); otherwise the deterministic core
 * fallback plays and games remain playable (the AI team just communicates in
 * noise).
 *
 * The seat's strategy string is an abstract difficulty tier (legacy GPT ids
 * canonicalize to one). Scout and Analyst answer in ONE call on the profile's
 * balanced / smart model; Mastermind runs the search in
 * `decrypto-mastermind.ts` (candidates per digit → simulated readers →
 * the best triple for the score → play-outs; ensemble guesses). Every entry
 * point catches, re-prompts once on a rules violation, and falls back
 * deterministically — and the machine's own race + sanitize sits above this
 * as the last belt, so nothing here can wedge a session.
 *
 * PROMPT DESIGN (`decrypto-prompts.ts`) — the whole game is the clue-history
 * table. Both roles get the history GROUPED BY DIGIT (exactly the table a
 * human keeps on the note sheet), and the output schemas force per-clue
 * reasoning scaffolds.
 */

/**
 * Per-call budgets inside the machine's race (encrypt 120 s, guess 60 s): a
 * corrective re-prompt only has whatever remains of the race before the
 * deterministic fallback answers anyway. DECRYPTO_REASONING_EFFORT
 * (low|medium|high) trades the one-call tiers' quality for latency.
 */
const ENCRYPT_BUDGET_MS = 80_000;
const GUESS_BUDGET_MS = 40_000;

export type Effort = "low" | "medium" | "high";

function reasoningEffort(): Effort {
  const value = process.env.DECRYPTO_REASONING_EFFORT;
  return value === "low" || value === "high" ? value : "medium";
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export const MASTERMIND = "decrypto-expert";

/** Tier id → the AI profile's role (lib/ai/models.ts); the env var pins one tier to a model. */
const TIER_MODELS: Record<string, { env: string; role: AiRole }> = {
  "decrypto-medium": { env: "DECRYPTO_MODEL_MEDIUM", role: "balanced" },
  "decrypto-hard": { env: "DECRYPTO_MODEL_HARD", role: "smart" },
  [MASTERMIND]: { env: "DECRYPTO_MODEL_EXPERT", role: "smart" },
};

/** Any stored strategy string → a known tier. Unknown ids play Mastermind: a client picks a tier, never a billed model. */
export function tierOf(raw: string | null | undefined): string {
  const tier = canonicalDecryptoModel(raw || DEFAULT_DECRYPTO_MODEL);
  return TIER_MODELS[tier] ? tier : MASTERMIND;
}

/** The registry id a tier's one-call answers run on (Mastermind: its main model). */
export function modelForTier(raw: string): string {
  const entry = TIER_MODELS[tierOf(raw)];
  if (!entry) throw new Error("decrypto tier table is empty");
  return tierModel(entry.env, entry.role);
}

// ---------------------------------------------------------------------------
// One-call answers
// ---------------------------------------------------------------------------

export interface Encrypted {
  clues: [string, string, string];
  note: ClueNote;
}

export interface Guessed {
  code: Code;
  note: GuessNote;
}

async function callEncrypt(input: EncryptInput, violation?: string): Promise<Encrypted> {
  const raw = await structuredGenerate({
    feature: "decrypto",
    label: "decrypto",
    modelOverride: modelForTier(input.model),
    system: encryptSystem(),
    user: encryptUser(input, violation),
    schemaName: "decrypto_clues",
    jsonSchema: ENCRYPT_JSON_SCHEMA,
    budgetMs: ENCRYPT_BUDGET_MS,
    reasoningEffort: reasoningEffort(),
  });
  const parsed = RawEncryptSchema.parse(raw);
  // The entries carry their target digit — realign to code order in case the
  // model listed them by digit instead of by position.
  const byDigit = new Map(parsed.clues.map((c) => [c.digit, c]));
  const realigned = input.code.map((d) => byDigit.get(d));
  const entries = realigned.every((c) => c !== undefined) ? realigned : parsed.clues;
  return {
    clues: entries.slice(0, 3).map((c) => c?.clue ?? "") as [string, string, string],
    note: {
      clues: entries.slice(0, 3).map((c) => ({
        link: noteText(c?.link ?? c?.facet),
        cover: noteText(c?.interceptorTest),
      })),
      tableRead: noteText(parsed.tableRead),
      search: null,
      standIn: false,
      cost: null,
      traceIds: [],
    },
  };
}

/** A one-call guess's per-clue reasons → its note. */
export function oneCallGuessNote(
  purpose: GuessInput["purpose"],
  code: readonly number[],
  reasons: readonly (string | undefined)[],
): GuessNote {
  return {
    purpose,
    picks: code.slice(0, 3).map((digit, i) => ({
      digit,
      why: noteText(reasons[i]),
      chances: null,
    })),
    columns: null,
    candidates: [],
    verdict: null,
    standIn: false,
    cost: null,
    traceIds: [],
  };
}

/** One guess on `model` (a registry id) — a one-call tier's answer, or a simulated person's. */
export async function guessWithModel(
  model: string,
  input: GuessInput,
  effort: Effort = reasoningEffort(),
  violation?: string,
): Promise<[number, number, number]> {
  return (await guessWithModelNoted(model, input, effort, violation)).code;
}

/** `guessWithModel`, with each clue's reasoning beside the code. */
export async function guessWithModelNoted(
  model: string,
  input: GuessInput,
  effort: Effort = reasoningEffort(),
  violation?: string,
): Promise<{ code: [number, number, number]; reasons: string[] }> {
  const raw = await structuredGenerate({
    feature: "decrypto",
    label: "decrypto",
    modelOverride: model,
    system: input.purpose === "decode" ? decodeSystem() : interceptSystem(),
    user: guessUser(input, violation),
    schemaName: "decrypto_guess",
    jsonSchema: GUESS_JSON_SCHEMA,
    budgetMs: GUESS_BUDGET_MS,
    reasoningEffort: effort,
  });
  const parsed = RawGuessSchema.parse(raw);
  const reasons = parsed.assignments.map((a) => a.reasoning);
  if (isValidCode(parsed.code)) return { code: parsed.code, reasons };
  // The final field disagreed with itself — fall back to the per-clue digits.
  return {
    code: parsed.assignments.map((a) => a.digit) as [number, number, number],
    reasons,
  };
}

function standInClues(input: EncryptInput): Encrypted {
  return { clues: fallbackClues(input), note: STAND_IN_CLUE_NOTE };
}

async function oneCallEncryptNoted(input: EncryptInput): Promise<Encrypted> {
  let answer = await callEncrypt(input);
  let legality = checkClueLegality(input.keywords, input.forbiddenClues, answer.clues);
  if (!legality.ok) {
    // One corrective re-prompt with the violation, then give up on the LLM.
    answer = await callEncrypt(input, legality.reason);
    legality = checkClueLegality(input.keywords, input.forbiddenClues, answer.clues);
    if (!legality.ok) return standInClues(input);
  }
  return answer;
}

async function oneCallEncrypt(input: EncryptInput): Promise<[string, string, string]> {
  return (await oneCallEncryptNoted(input)).clues;
}

async function oneCallGuessNoted(input: GuessInput): Promise<Guessed> {
  const model = modelForTier(input.model);
  const first = await guessWithModelNoted(model, input);
  if (isValidCode(first.code)) {
    return { code: first.code, note: oneCallGuessNote(input.purpose, first.code, first.reasons) };
  }
  const second = await guessWithModelNoted(
    model,
    input,
    reasoningEffort(),
    `digits must be three DIFFERENT values, got ${first.code.join("-")}`,
  );
  if (!isValidCode(second.code)) throw new Error(`invalid guess ${second.code.join("-")}`);
  return { code: second.code, note: oneCallGuessNote(input.purpose, second.code, second.reasons) };
}

/** A guess as the tier `tier` plays it, with its note. */
export function guessAsNoted(tier: string, input: GuessInput): Promise<Guessed> {
  const asTier = { ...input, model: tier };
  return tierOf(tier) === MASTERMIND ? mastermindGuessNoted(asTier) : oneCallGuessNoted(asTier);
}

/** A guess as the tier `tier` plays it — what the Mastermind's play-outs ask its teammate and rival. */
export async function guessAs(tier: string, input: GuessInput): Promise<Code> {
  return (await guessAsNoted(tier, input)).code;
}

// ---------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------

export const openAiDecryptoAgent = {
  async encrypt(input): Promise<Encrypted> {
    try {
      if (tierOf(input.model) === MASTERMIND) {
        const answer = await mastermindEncryptNoted(input, {
          guessAs,
          guessWithModel,
          oneCallEncrypt,
          oneCallEncryptNoted,
          modelForTier,
        });
        if (checkClueLegality(input.keywords, input.forbiddenClues, answer.clues).ok) {
          return answer;
        }
        return await oneCallEncryptNoted(input);
      }
      return await oneCallEncryptNoted(input);
    } catch (err) {
      console.error("[decrypto] encrypt failed, using fallback:", causeChain(err));
      return standInClues(input);
    }
  },

  async guess(input): Promise<Guessed> {
    try {
      return await guessAsNoted(input.model, input);
    } catch (err) {
      console.error("[decrypto] guess failed, using fallback:", causeChain(err));
      const code = fallbackGuess(input);
      return { code, note: standInGuessNote(input.purpose, code) };
    }
  },
} satisfies DecryptoAiAgent;
