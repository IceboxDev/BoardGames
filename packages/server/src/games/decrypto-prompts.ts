import type {
  DecodeMistake,
  EncryptInput,
  GuessInput,
  RevealedClue,
} from "@boardgames/core/games/decrypto/ai/agent";
import { z } from "zod";

// The Decrypto agents' prompts and output schemas, shared by the one-call
// tiers (decrypto-agent.ts) and the Mastermind's search (decrypto-mastermind.ts).

// ---------------------------------------------------------------------------
// Output schemas (strict JSON Schema + zod re-validation)
// ---------------------------------------------------------------------------

export const ENCRYPT_JSON_SCHEMA = {
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
          link: {
            type: "string",
            description:
              "For the debrief, after choosing: how this clue leads your teammates to the keyword, in a short phrase (e.g. 'mosaic → tiny tiles → tesserae').",
          },
        },
        required: ["digit", "facet", "interceptorTest", "clue", "link"],
      },
    },
  },
  required: ["tableRead", "clues"],
};

export const GUESS_JSON_SCHEMA = {
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

export const RawEncryptSchema = z.object({
  tableRead: z.string(),
  clues: z
    .array(
      z.object({
        digit: z.number().int(),
        facet: z.string(),
        interceptorTest: z.string(),
        clue: z.string(),
        link: z.string().optional(),
      }),
    )
    .length(3),
});

export const RawGuessSchema = z.object({
  assignments: z
    .array(z.object({ clue: z.string(), reasoning: z.string(), digit: z.number().int() }))
    .length(3),
  code: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const RULES_PRIMER = `Decrypto in brief: each team guards four secret keywords numbered 1-4.
Each round the team's Encryptor receives a secret CODE — an ordered sequence of three
DIFFERENT digits from 1-4 — and publishes three clues, one per digit IN ORDER, each
evoking the MEANING of the keyword with that number. The encryptor's own team must
reconstruct the code from the clues; the opposing team hears the same clues and tries
to intercept the code using only the team's accumulated public clue history (they never
see the keywords). Exact match required. 2 interceptions win the game; 2 miscommunications
(your own team decoding wrong) lose it.`;

/** The note-sheet view of a clue history: one line per digit column. */
export function digitTable(clues: RevealedClue[]): string {
  const columns: string[][] = [[], [], [], []];
  for (const c of clues) columns[c.digit - 1]?.push(`"${c.clue}" (r${c.round})`);
  return columns
    .map((col, i) => `  #${i + 1}: ${col.length > 0 ? col.join(", ") : "(no clues yet)"}`)
    .join("\n");
}

/** Past decode failures, one line each: what the clue meant vs what was guessed. */
export function mistakesText(mistakes: DecodeMistake[]): string {
  if (mistakes.length === 0) return "(none — every decode so far was exact)";
  return mistakes
    .map(
      (m) =>
        `  r${m.round}: "${m.clue}" meant #${m.meantDigit}, decoded as ${
          m.decodedAs === null ? "nothing (skipped)" : `#${m.decodedAs}`
        }`,
    )
    .join("\n");
}

export function encryptSystem(): string {
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

LEARN FROM MISCOMMUNICATIONS: the past-misreads list shows exactly where your
decoder's mental model diverges from yours. A clue meant for #3 that was
decoded as #2 means those two keywords overlap in your decoder's mind — when
cluing EITHER of them again, pick a facet that clearly excludes the other one.
Never repeat the kind of association that already got misread.

Score awareness: if the enemy already holds an interception token, obliqueness
is survival. If your team already holds a miscommunication token, clarity is
survival — one more wrong decode loses the game outright, so favor the
teammate test over the interceptor test. With both, prefer a clear clue on an
empty-ish column and an oblique one where history is thick.

Keep every reasoning field to one terse sentence — spend your thinking on the
clues, not on prose.

HARD RULES (mechanically enforced — a violation wastes the attempt):
- Clues reference MEANING only: never spelling, letter count, position, or
  pronunciation/rhyme.
- Never use a keyword itself, or a translation of it, in any clue.
- Never repeat a clue from the forbidden list. Near-duplicates ("ocean" after
  "sea") are technically legal but strategically identical to repeats — treat
  them as forbidden.
- Each clue is 1-40 characters; one or two evocative words is the ideal form.`;
}

export function decodeSystem(): string {
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
   — trust the elimination, not a forced surface match.
4. Learn from your team's past misreads (listed if any): if you previously
   confused two keywords, your encryptor KNOWS that and is now deliberately
   disambiguating exactly that pair — weigh the less-obvious reading of a
   clue that touches either of them. A second identical confusion loses the
   game.

Keep every reasoning field to one terse sentence.`;
}

export function interceptSystem(): string {
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
Always commit a full guess: a structured best guess beats no attempt.

Keep every reasoning field to one terse sentence.`;
}

export function encryptUser(input: EncryptInput, violation?: string): string {
  const sections = [
    `SECRET CODE: ${input.code.join("-")}  (clue 1 -> keyword #${input.code[0]}, clue 2 -> keyword #${input.code[1]}, clue 3 -> keyword #${input.code[2]})`,
    `ROUND: ${input.round}`,
    `YOUR KEYWORDS:\n  #1: ${input.keywords[0]}\n  #2: ${input.keywords[1]}\n  #3: ${input.keywords[2]}\n  #4: ${input.keywords[3]}`,
    `YOUR TEAM'S PUBLIC CLUE TABLE (the enemy sees exactly this):\n${digitTable(input.ownRevealedClues)}`,
    `ENEMY TEAM'S PUBLIC CLUE TABLE (context only):\n${digitTable(input.oppRevealedClues)}`,
    `FORBIDDEN CLUES (already used by your team): ${
      input.forbiddenClues.length > 0 ? input.forbiddenClues.join(", ") : "(none)"
    }`,
    `YOUR TEAM'S PAST MISREADS (disambiguate these confusions):\n${mistakesText(input.ownDecodeMistakes)}`,
    `SCORE: you ${input.tokens.own.interceptions} interceptions / ${input.tokens.own.miscommunications} miscommunications — enemy ${input.tokens.opp.interceptions} / ${input.tokens.opp.miscommunications}`,
  ];
  if (violation) {
    sections.push(
      `YOUR PREVIOUS ANSWER BROKE A RULE: ${violation}. Produce three NEW clues that follow every hard rule.`,
    );
  }
  return sections.join("\n\n");
}

export function guessUser(input: GuessInput, violation?: string): string {
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
    sections.push(
      `YOUR TEAM'S PAST MISREADS (don't repeat these confusions):\n${mistakesText(input.pastDecodeMistakes)}`,
    );
  }
  if (violation) {
    sections.push(`YOUR PREVIOUS ANSWER WAS INVALID: ${violation}. Answer again.`);
  }
  return sections.join("\n\n");
}
