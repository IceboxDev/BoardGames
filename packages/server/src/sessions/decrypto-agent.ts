import type {
  DecryptoAiAgent,
  EncryptInput,
  GuessInput,
  RevealedClue,
} from "@boardgames/core/games/decrypto/ai/agent";
import { setDecryptoAgent } from "@boardgames/core/games/decrypto/ai/agent";
import { fallbackClues, fallbackGuess } from "@boardgames/core/games/decrypto/ai/fallback";
import { DEFAULT_DECRYPTO_MODEL } from "@boardgames/core/games/decrypto/ai/models";
import { checkClueLegality, isValidCode } from "@boardgames/core/games/decrypto/rules";
import type { Code } from "@boardgames/core/games/decrypto/types";
import { z } from "zod";
import { causeChain, getOpenAIClient, structuredCall } from "../lib/llm";

/**
 * OpenAI-backed Decrypto agent. Installed at boot by `maybeEnableDecryptoAgent`
 * when OPENAI_API_KEY is configured; otherwise the deterministic core fallback
 * stays and games remain playable (the AI team just communicates in noise).
 *
 * The model is the seat's strategy string, passed verbatim as the OpenAI
 * `model` parameter. Every entry point catches, re-prompts once on a rules
 * violation, and falls back deterministically — and the machine's own 45s
 * race + sanitize sits above this as the last belt, so nothing here can wedge
 * a session.
 */

/**
 * Per-call budget. The machine's 45s race sits above this: a first call gets
 * the full budget, and a corrective re-prompt only has whatever remains of the
 * race before the deterministic fallback answers anyway — that's fine, the
 * re-prompt is a best-effort nicety. Reasoning effort is pinned LOW: these are
 * short party-game decisions, and even gpt-5-mini blows an 18s budget at its
 * default effort.
 */
const CALL_BUDGET_MS = 40_000;
const REASONING_EFFORT = "low";

const ENCRYPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasoning: {
      type: "string",
      description: "Brief private reasoning about clue choices and interception risk.",
    },
    clues: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 40 },
      description: "Exactly three clues, in code order.",
    },
  },
  required: ["reasoning", "clues"],
};

const GUESS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasoning: {
      type: "string",
      description: "Brief private reasoning mapping each clue to a digit.",
    },
    code: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "integer", enum: [1, 2, 3, 4] },
      description: "The guessed code: three DIFFERENT digits, in clue order.",
    },
  },
  required: ["reasoning", "code"],
};

const RawEncryptSchema = z.object({
  reasoning: z.string(),
  clues: z.tuple([z.string(), z.string(), z.string()]),
});

const RawGuessSchema = z.object({
  reasoning: z.string(),
  code: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
});

const RULES_PRIMER = `Decrypto in brief: each team guards four secret keywords numbered 1-4.
Each round the team's Encryptor receives a secret CODE — an ordered sequence of three
DIFFERENT digits from 1-4 — and publishes three clues, one per digit IN ORDER, each
evoking the MEANING of the keyword with that number. The encryptor's own team must
reconstruct the code from the clues; the opposing team hears the same clues and tries
to intercept the code using only the team's accumulated public clue history (they never
see the keywords). Exact match required. 2 interceptions win; 2 miscommunications
(your own team decoding wrong) lose.`;

function historyText(clues: RevealedClue[]): string {
  if (clues.length === 0) return "(none yet)";
  return clues.map((c) => `round ${c.round}: "${c.clue}" -> #${c.digit}`).join("\n");
}

function modelFor(input: { model: string }): string {
  return input.model || process.env.OPENAI_MODEL || DEFAULT_DECRYPTO_MODEL;
}

function encryptSystem(): string {
  return `${RULES_PRIMER}

You are the ENCRYPTOR. Follow these hard rules for every clue:
- A clue refers to the MEANING of its keyword — never its spelling, letter count,
  position number, or pronunciation.
- Never use a keyword itself (or a translation of it) in any clue.
- Never repeat a clue your team has already given (the forbidden list is provided).
- Keep each clue between 1 and 40 characters. Prefer a single evocative word or a
  terse phrase.

Strategy: your teammates KNOW the keywords — the opponents only see your past clues
grouped by digit (that history is provided; they see it too). Pick clues your team
will connect but that avoid extending the associative pattern the opponents have
already observed for each digit. Round 1 has no history, so you can be more direct;
later rounds demand obliqueness.`;
}

function guessSystem(purpose: GuessInput["purpose"]): string {
  if (purpose === "decode") {
    return `${RULES_PRIMER}

You are DECODING your own encryptor's clues. You know your team's four keywords,
numbered 1-4. Map each clue, in order, to the keyword number it most plausibly
evokes. The three digits are always DIFFERENT. Your encryptor also avoids reusing
past clues, so expect oblique associations in later rounds.`;
  }
  return `${RULES_PRIMER}

You are INTERCEPTING the opposing team's transmission. You do NOT know their
keywords. Use their revealed clue history (clue -> digit) to infer which digit each
new clue points at: cluster the new clue with past clues by shared theme. The three
digits are always DIFFERENT. If the history is thin, commit to your best structural
guess anyway.`;
}

function encryptUser(input: EncryptInput, violation?: string): string {
  const payload = {
    yourKeywords: {
      1: input.keywords[0],
      2: input.keywords[1],
      3: input.keywords[2],
      4: input.keywords[3],
    },
    secretCode: input.code,
    round: input.round,
    yourTeamsPastCluesByDigit: historyText(input.ownRevealedClues),
    opposingTeamsPastCluesByDigit: historyText(input.oppRevealedClues),
    forbiddenClues: input.forbiddenClues,
    tokens: input.tokens,
  };
  const correction = violation
    ? `\n\nYour previous answer broke a rule: ${violation}. Produce three NEW clues that follow every rule.`
    : "";
  return `Give three clues for secret code ${input.code.join("-")} (clue 1 -> keyword #${input.code[0]}, clue 2 -> keyword #${input.code[1]}, clue 3 -> keyword #${input.code[2]}).\n\n${JSON.stringify(payload, null, 2)}${correction}`;
}

function guessUser(input: GuessInput, violation?: string): string {
  const payload = {
    currentClues: input.currentClues,
    round: input.round,
    encryptingTeamsRevealedClues: historyText(input.targetRevealedClues),
    ...(input.keywords
      ? {
          yourKeywords: {
            1: input.keywords[0],
            2: input.keywords[1],
            3: input.keywords[2],
            4: input.keywords[3],
          },
        }
      : {}),
  };
  const correction = violation
    ? `\n\nYour previous answer was invalid: ${violation}. Answer again with three DIFFERENT digits.`
    : "";
  return `Guess the three-digit code for these clues, in order.\n\n${JSON.stringify(payload, null, 2)}${correction}`;
}

async function callEncrypt(
  input: EncryptInput,
  violation?: string,
): Promise<[string, string, string]> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OPENAI_API_KEY not configured");
  const raw = await structuredCall(client, {
    label: "decrypto",
    model: modelFor(input),
    system: encryptSystem(),
    user: encryptUser(input, violation),
    schemaName: "decrypto_clues",
    jsonSchema: ENCRYPT_JSON_SCHEMA,
    budgetMs: CALL_BUDGET_MS,
    reasoningEffort: REASONING_EFFORT,
  });
  return RawEncryptSchema.parse(raw).clues;
}

async function callGuess(input: GuessInput, violation?: string): Promise<[number, number, number]> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OPENAI_API_KEY not configured");
  const raw = await structuredCall(client, {
    label: "decrypto",
    model: modelFor(input),
    system: guessSystem(input.purpose),
    user: guessUser(input, violation),
    schemaName: "decrypto_guess",
    jsonSchema: GUESS_JSON_SCHEMA,
    budgetMs: CALL_BUDGET_MS,
    reasoningEffort: REASONING_EFFORT,
  });
  return RawGuessSchema.parse(raw).code;
}

export const openAiDecryptoAgent: DecryptoAiAgent = {
  async encrypt(input) {
    try {
      let clues = await callEncrypt(input);
      let legality = checkClueLegality(input.keywords, input.forbiddenClues, clues);
      if (!legality.ok) {
        // One corrective re-prompt with the violation, then give up on the LLM.
        clues = await callEncrypt(input, legality.reason);
        legality = checkClueLegality(input.keywords, input.forbiddenClues, clues);
        if (!legality.ok) return fallbackClues(input);
      }
      return clues;
    } catch (err) {
      console.error("[decrypto] encrypt failed, using fallback:", causeChain(err));
      return fallbackClues(input);
    }
  },

  async guess(input): Promise<Code> {
    try {
      const first = await callGuess(input);
      if (isValidCode(first)) return first;
      const second = await callGuess(
        input,
        `digits must be three DIFFERENT values, got ${first.join("-")}`,
      );
      return isValidCode(second) ? second : fallbackGuess(input);
    } catch (err) {
      console.error("[decrypto] guess failed, using fallback:", causeChain(err));
      return fallbackGuess(input);
    }
  },
};

/** Install the OpenAI agent when the key is configured; otherwise keep the fallback. */
export function maybeEnableDecryptoAgent(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.log("[decrypto] OPENAI_API_KEY not set — AI seats use the deterministic fallback");
    return;
  }
  setDecryptoAgent(openAiDecryptoAgent);
  console.log("[decrypto] GPT agent enabled for AI seats");
}
