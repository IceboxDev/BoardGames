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
 * violation, and falls back deterministically — and the machine's own 90s
 * race + sanitize sits above this as the last belt, so nothing here can wedge
 * a session.
 *
 * PROMPT DESIGN — the whole game is the clue-history table. Both roles get
 * the history GROUPED BY DIGIT (exactly the table a human keeps on the note
 * sheet), and the output schemas force per-clue reasoning scaffolds:
 * the encryptor must name the facet used and pass an explicit "interceptor
 * test" per clue (repeating an associative angle is how you get intercepted),
 * and guessers must assign digit-by-digit before committing a code.
 */

/**
 * Per-call budgets. The machine's 90s race sits above these: a first call
 * gets the full budget, and a corrective re-prompt only has whatever remains
 * of the race before the deterministic fallback answers anyway. Reasoning
 * effort defaults to MEDIUM (quality-first; the old low-effort prompt gave
 * lazy, clustered associations). Encrypt is the heavyweight task — facet
 * analysis × interceptor simulation runs gpt-5.5 to ~40-80s, overlapping the
 * human encryptor writing their own clues; guesses land in ~10-20s. The
 * DECRYPTO_REASONING_EFFORT env var (low|medium|high) trades quality for
 * latency without a deploy (low keeps the facet discipline at ~15s encrypts).
 */
const ENCRYPT_BUDGET_MS = 80_000;
const GUESS_BUDGET_MS = 40_000;

function reasoningEffort(): "low" | "medium" | "high" {
  const value = process.env.DECRYPTO_REASONING_EFFORT;
  return value === "low" || value === "high" ? value : "medium";
}

// ---------------------------------------------------------------------------
// Output schemas (strict JSON Schema + zod re-validation)
// ---------------------------------------------------------------------------

const ENCRYPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tableRead: {
      type: "string",
      description:
        "What the interceptor most likely believes each of your digits means, based only on your public clue table.",
    },
    clues: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      description: "One entry per code digit, in code order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          digit: { type: "integer", enum: [1, 2, 3, 4] },
          facet: {
            type: "string",
            description:
              "The associative angle used (appearance / function / culture / history / metaphor / famous example / ...). Must differ from every angle already used for this digit.",
          },
          interceptorTest: {
            type: "string",
            description:
              "Seeing only the public table plus this clue, which column would an outsider pick, and why is it NOT the true one?",
          },
          clue: { type: "string", minLength: 1, maxLength: 40 },
        },
        required: ["digit", "facet", "interceptorTest", "clue"],
      },
    },
  },
  required: ["tableRead", "clues"],
};

const GUESS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assignments: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      description: "One entry per clue, in clue order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          clue: { type: "string" },
          reasoning: {
            type: "string",
            description:
              "Score this clue against every digit (or keyword), then resolve conflicts globally by elimination.",
          },
          digit: { type: "integer", enum: [1, 2, 3, 4] },
        },
        required: ["clue", "reasoning", "digit"],
      },
    },
    code: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "integer", enum: [1, 2, 3, 4] },
      description:
        "The final answer: three DIFFERENT digits, in clue order. Must match the assignments.",
    },
  },
  required: ["assignments", "code"],
};

const RawEncryptSchema = z.object({
  tableRead: z.string(),
  clues: z
    .array(
      z.object({
        digit: z.number().int(),
        facet: z.string(),
        interceptorTest: z.string(),
        clue: z.string(),
      }),
    )
    .length(3),
});

const RawGuessSchema = z.object({
  assignments: z
    .array(z.object({ clue: z.string(), reasoning: z.string(), digit: z.number().int() }))
    .length(3),
  code: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const RULES_PRIMER = `Decrypto in brief: each team guards four secret keywords numbered 1-4.
Each round the team's Encryptor receives a secret CODE — an ordered sequence of three
DIFFERENT digits from 1-4 — and publishes three clues, one per digit IN ORDER, each
evoking the MEANING of the keyword with that number. The encryptor's own team must
reconstruct the code from the clues; the opposing team hears the same clues and tries
to intercept the code using only the team's accumulated public clue history (they never
see the keywords). Exact match required. 2 interceptions win the game; 2 miscommunications
(your own team decoding wrong) lose it.`;

/** The note-sheet view of a clue history: one line per digit column. */
function digitTable(clues: RevealedClue[]): string {
  const columns: string[][] = [[], [], [], []];
  for (const c of clues) columns[c.digit - 1]?.push(`"${c.clue}" (r${c.round})`);
  return columns
    .map((col, i) => `  #${i + 1}: ${col.length > 0 ? col.join(", ") : "(no clues yet)"}`)
    .join("\n");
}

function encryptSystem(): string {
  return `You are an expert Decrypto player acting as your team's ENCRYPTOR.

${RULES_PRIMER}

THE CENTRAL SKILL — anti-interception clue craft. The enemy cannot see your
keywords; their only weapon is your public clue table grouped by digit (you
get the exact table below — they see the same one). Every clue you give adds
a data point to it. You lose the moment your clues become predictable: if a
new clue obviously clusters with the existing clues in its digit's column,
the enemy intercepts WITHOUT ever knowing the keyword. Giving another clue
from the same associative angle as a previous clue for the same digit is the
single worst move in this game.

For EVERY clue, work through this checklist:
1. Enumerate the keyword's facets: appearance, function, material, sound,
   habitat/context, culture & idiom, history, famous examples, emotions,
   metaphorical uses.
2. Look at that digit's column in YOUR table. Identify which facets are
   already burned. Choose an UNUSED facet — never repeat an angle.
3. INTERCEPTOR TEST: pretend you can only see the public table plus your new
   clue. Which column would you file it under? If the answer is the true
   column, the clue is burned — pick a different facet. (Empty columns are
   exempt: with no history there is nothing to cluster against, so round-1
   clues may be direct.)
4. TEAMMATE TEST: your decoder knows the four keywords and the same table.
   Would they confidently pick the right keyword over the other three? A clue
   only you understand is a miscommunication — that also loses the game.
5. CROSS-KEYWORD TEST: make sure the clue doesn't fit one of your OTHER three
   keywords better, or your own team will mis-assign it.

Score awareness: if the enemy already holds an interception token, obliqueness
is survival. If your team already holds a miscommunication token, clarity is
survival. With both, prefer a clear clue on an empty-ish column and an oblique
one where history is thick.

HARD RULES (mechanically enforced — a violation wastes the attempt):
- Clues reference MEANING only: never spelling, letter count, position, or
  pronunciation/rhyme.
- Never use a keyword itself, or a translation of it, in any clue.
- Never repeat a clue from the forbidden list. Near-duplicates ("ocean" after
  "sea") are technically legal but strategically identical to repeats — treat
  them as forbidden.
- Each clue is 1-40 characters; one or two evocative words is the ideal form.`;
}

function decodeSystem(): string {
  return `You are an expert Decrypto player DECODING your own encryptor's transmission.

${RULES_PRIMER}

You know your team's four keywords AND the full table of your team's past
clues per digit. This is an assignment problem — three clues, in order, onto
three DIFFERENT keyword numbers:
1. Score each clue against ALL FOUR keywords. Expect oblique angles: your
   encryptor deliberately avoids repeating any associative angle already in
   the table, so the fit may be a fresh facet (culture, metaphor, history)
   rather than the obvious one.
2. Resolve globally: digits are distinct. If two clues both point at one
   keyword, keep the stronger fit and reassign the weaker by elimination.
3. A clue that seems to fit nothing usually belongs to the remaining keyword
   — trust the elimination, not a forced surface match.`;
}

function interceptSystem(): string {
  return `You are an expert Decrypto player INTERCEPTING the opposing team's transmission.

${RULES_PRIMER}

You never see their keywords. Your evidence is their public clue table grouped
by digit — the concept behind each column is stable all game, so every past
clue narrows it. Method, for the three new clues in order:
1. For each clue, compare against every column: cluster by underlying CONCEPT,
   not surface words — skilled encryptors switch facets each round, so "wide
   brim" and "mexico" can be the same column seen from different angles. First
   hypothesize what concept each column might denote, then test the clue
   against those concepts.
2. Score all four digits for each clue, then solve globally under the
   distinctness constraint (three DIFFERENT digits). Commit weak clues by
   elimination from the strong ones.
3. Columns with little or no history are live candidates — a clue matching
   nothing known often belongs to the emptiest column.
Always commit a full guess: a structured best guess beats no attempt.`;
}

function encryptUser(input: EncryptInput, violation?: string): string {
  const sections = [
    `SECRET CODE: ${input.code.join("-")}  (clue 1 -> keyword #${input.code[0]}, clue 2 -> keyword #${input.code[1]}, clue 3 -> keyword #${input.code[2]})`,
    `ROUND: ${input.round}`,
    `YOUR KEYWORDS:\n  #1: ${input.keywords[0]}\n  #2: ${input.keywords[1]}\n  #3: ${input.keywords[2]}\n  #4: ${input.keywords[3]}`,
    `YOUR TEAM'S PUBLIC CLUE TABLE (the enemy sees exactly this):\n${digitTable(input.ownRevealedClues)}`,
    `ENEMY TEAM'S PUBLIC CLUE TABLE (context only):\n${digitTable(input.oppRevealedClues)}`,
    `FORBIDDEN CLUES (already used by your team): ${
      input.forbiddenClues.length > 0 ? input.forbiddenClues.join(", ") : "(none)"
    }`,
    `SCORE: you ${input.tokens.own.interceptions} interceptions / ${input.tokens.own.miscommunications} miscommunications — enemy ${input.tokens.opp.interceptions} / ${input.tokens.opp.miscommunications}`,
  ];
  if (violation) {
    sections.push(
      `YOUR PREVIOUS ANSWER BROKE A RULE: ${violation}. Produce three NEW clues that follow every hard rule.`,
    );
  }
  return sections.join("\n\n");
}

function guessUser(input: GuessInput, violation?: string): string {
  const sections = [
    `THE THREE CLUES, IN ORDER: ${input.currentClues.map((c) => `"${c}"`).join(", ")}`,
    `ROUND: ${input.round}`,
    `THE ENCRYPTING TEAM'S PUBLIC CLUE TABLE:\n${digitTable(input.targetRevealedClues)}`,
  ];
  if (input.keywords) {
    sections.splice(
      1,
      0,
      `YOUR TEAM'S KEYWORDS:\n  #1: ${input.keywords[0]}\n  #2: ${input.keywords[1]}\n  #3: ${input.keywords[2]}\n  #4: ${input.keywords[3]}`,
    );
  }
  if (violation) {
    sections.push(`YOUR PREVIOUS ANSWER WAS INVALID: ${violation}. Answer again.`);
  }
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

function modelFor(input: { model: string }): string {
  return input.model || process.env.OPENAI_MODEL || DEFAULT_DECRYPTO_MODEL;
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

async function callGuess(input: GuessInput, violation?: string): Promise<[number, number, number]> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OPENAI_API_KEY not configured");
  const raw = await structuredCall(client, {
    label: "decrypto",
    model: modelFor(input),
    system: input.purpose === "decode" ? decodeSystem() : interceptSystem(),
    user: guessUser(input, violation),
    schemaName: "decrypto_guess",
    jsonSchema: GUESS_JSON_SCHEMA,
    budgetMs: GUESS_BUDGET_MS,
    reasoningEffort: reasoningEffort(),
  });
  const parsed = RawGuessSchema.parse(raw);
  if (isValidCode(parsed.code)) return parsed.code;
  // The final field disagreed with itself — fall back to the per-clue digits.
  return parsed.assignments.map((a) => a.digit) as [number, number, number];
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
