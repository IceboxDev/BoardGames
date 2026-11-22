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
import { checkClueLegality, isValidCode } from "@boardgames/core/games/decrypto/rules";
import type { Code } from "@boardgames/core/games/decrypto/types";
import { type AiRole, causeChain, structuredGenerate, tierModel } from "../lib/ai";
import { mastermindEncrypt, mastermindGuess } from "./decrypto-mastermind";
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

async function callEncrypt(
  input: EncryptInput,
  violation?: string,
): Promise<[string, string, string]> {
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
  const byDigit = new Map(parsed.clues.map((c) => [c.digit, c.clue]));
  const realigned = input.code.map((d) => byDigit.get(d));
  if (realigned.every((c): c is string => typeof c === "string")) {
    return realigned as [string, string, string];
  }
  return parsed.clues.map((c) => c.clue) as [string, string, string];
}

/** One guess on `model` (a registry id) — a one-call tier's answer, or a simulated person's. */
export async function guessWithModel(
  model: string,
  input: GuessInput,
  effort: Effort = reasoningEffort(),
  violation?: string,
): Promise<[number, number, number]> {
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
  if (isValidCode(parsed.code)) return parsed.code;
  // The final field disagreed with itself — fall back to the per-clue digits.
  return parsed.assignments.map((a) => a.digit) as [number, number, number];
}

async function oneCallEncrypt(input: EncryptInput): Promise<[string, string, string]> {
  let clues = await callEncrypt(input);
  let legality = checkClueLegality(input.keywords, input.forbiddenClues, clues);
  if (!legality.ok) {
    // One corrective re-prompt with the violation, then give up on the LLM.
    clues = await callEncrypt(input, legality.reason);
    legality = checkClueLegality(input.keywords, input.forbiddenClues, clues);
    if (!legality.ok) return fallbackClues(input);
  }
  return clues;
}

async function oneCallGuess(input: GuessInput): Promise<Code> {
  const model = modelForTier(input.model);
  const first = await guessWithModel(model, input);
  if (isValidCode(first)) return first;
  const second = await guessWithModel(
    model,
    input,
    reasoningEffort(),
    `digits must be three DIFFERENT values, got ${first.join("-")}`,
  );
  if (!isValidCode(second)) throw new Error(`invalid guess ${second.join("-")}`);
  return second;
}

/** A guess as the tier `tier` plays it — what the Mastermind's play-outs ask its teammate and rival. */
export function guessAs(tier: string, input: GuessInput): Promise<Code> {
  const asTier = { ...input, model: tier };
  return tierOf(tier) === MASTERMIND ? mastermindGuess(asTier) : oneCallGuess(asTier);
}

// ---------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------

export const openAiDecryptoAgent: DecryptoAiAgent = {
  async encrypt(input) {
    try {
      if (tierOf(input.model) === MASTERMIND) {
        const clues = await mastermindEncrypt(input, {
          guessAs,
          guessWithModel,
          oneCallEncrypt,
          modelForTier,
        });
        if (checkClueLegality(input.keywords, input.forbiddenClues, clues).ok) return clues;
        return await oneCallEncrypt(input);
      }
      return await oneCallEncrypt(input);
    } catch (err) {
      console.error("[decrypto] encrypt failed, using fallback:", causeChain(err));
      return fallbackClues(input);
    }
  },

  async guess(input): Promise<Code> {
    try {
      return await guessAs(input.model, input);
    } catch (err) {
      console.error("[decrypto] guess failed, using fallback:", causeChain(err));
      return fallbackGuess(input);
    }
  },
};
