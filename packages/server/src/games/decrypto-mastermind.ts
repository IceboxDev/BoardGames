import type { EncryptInput, GuessInput } from "@boardgames/core/games/decrypto/ai/agent";
import { ALL_CODES, clueWords, normalizeClue } from "@boardgames/core/games/decrypto/rules";
import { type Code, MAX_CLUE_LENGTH } from "@boardgames/core/games/decrypto/types";
import { z } from "zod";
import { causeChain, structuredGenerate, tierModel } from "../lib/ai";
import {
  decodeSystem,
  digitTable,
  encryptSystem,
  encryptUser,
  guessUser,
  interceptSystem,
  mistakesText,
  RULES_PRIMER,
} from "./decrypto-prompts";

// ── The Mastermind: Decrypto's search tier ─────────────────────────────────
//
// ENCRYPT (`mastermindEncrypt`), the Codenames Mastermind's recipe moved to
// Decrypto's question — not "how many words can one clue carry" but "will my
// team read these three exactly, and will the enemy not":
//   1. Candidates. Several brainstorms beside each other, each through its
//      own lens (best craft, misdirection, fresh facets, plain clarity), give
//      a handful of clues for every position of the code.
//   2. Readers. Every candidate is read alone by whoever will really guess it:
//      the decoder (the teammate's own tier, or three simulated people of
//      different strength) as chances over the four keywords, and the
//      interceptor (the rival's tier, or two simulated people) as chances
//      over the four public columns.
//   3. The triple. Each combination's chance of an exact decode and of an
//      exact interception comes from the 24 legal codes (a code's likelihood =
//      the product of its three rows), and the score prices each token by
//      what it would cost now (a second token loses the game).
//   4. Play-outs. The best few triples are guessed for real — the decoder's
//      and the interceptor's actual pipelines — and the measured hits pull
//      each estimate before the final pick.
// Every phase has a deadline inside the machine's 120 s race; what finished
// is used, and with nothing at all the one-call encryptor answers.
//
// GUESS (`mastermindGuess`): several independent probability tables (three
// rows of chances over the four digits) averaged, then the likeliest of the
// 24 legal codes — an ensemble instead of one model's single read.

type Effort = "low" | "medium" | "high";
type Row = [number, number, number, number];
type Triple = [string, string, string];

export interface MastermindDeps {
  /** A guess as `tier` plays it (the decoder's or interceptor's real pipeline). */
  guessAs(tier: string, input: GuessInput): Promise<Code>;
  /** One plain guess on a registry model — a simulated person. */
  guessWithModel(model: string, input: GuessInput, effort?: Effort): Promise<number[]>;
  /** The one-call encryptor — the floor when the search finds nothing. */
  oneCallEncrypt(input: EncryptInput): Promise<Triple>;
}

/** The whole encrypt search answers by this; the machine races 120 s. */
const SEARCH_MS = Number(process.env.DECRYPTO_MASTER_SEARCH_MS) || 92_000;
const BRAINSTORM_MS = 48_000;
const READ_MS = 24_000;
const GUESS_MS = 45_000;
/** Candidates asked of each lens per position. */
const PER_LENS = 5;
/** Candidates kept per position (the readers read every one). */
const MAX_POOL = 8;
/** Triples played out for real, per wave. */
const PLAY_TRIPLES = 3;
/** Play-out waves at most (DECRYPTO_MASTER_WAVES). */
const PLAY_WAVES = Math.max(1, Number(process.env.DECRYPTO_MASTER_WAVES) || 1);
/** How many "estimate" observations the reader's chance counts as, against each real play-out. */
const PRIOR_WEIGHT = 1;
/** A token that would be the team's second costs the game: this many ordinary tokens. */
const LOSING_TOKEN = 4;
/** What newly giving a keyword away costs, in tokens (later interceptions). */
const EXPOSURE_COST = Number(process.env.DECRYPTO_MASTER_EXPOSURE ?? 1.2);
/** No reader is ever certain: rows are floored before they're normalised. */
const ROW_FLOOR = 0.02;

/** Model calls at once across every Mastermind in the process (a provider rejects more). */
const CONCURRENCY = Math.max(1, Number(process.env.DECRYPTO_AI_CONCURRENCY) || 32);
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await run();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Every promise's value that arrived within `ms`; failures and stragglers are dropped. */
async function settledBy<T>(runs: readonly Promise<T>[], ms: number): Promise<T[]> {
  const out: (T | undefined)[] = runs.map(() => undefined);
  const done = runs.map((run, i) =>
    run.then(
      (value) => {
        out[i] = value;
      },
      (err) => console.warn("[decrypto] mastermind part failed:", causeChain(err)),
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(done),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, ms));
    }),
  ]);
  clearTimeout(timer);
  return out.filter((value): value is T => value !== undefined);
}

function smartModel(): string {
  return tierModel("DECRYPTO_MODEL_EXPERT", "smart");
}
function balancedModel(): string {
  return tierModel("DECRYPTO_MASTER_BALANCED", "balanced");
}

/** Three people of different strength, as Codenames' judges (`judgeProfiles`). */
export function peopleModels(): string[] {
  return [
    tierModel("DECRYPTO_JUDGE_FAST", "fast"),
    tierModel("DECRYPTO_JUDGE_BALANCED", "balanced"),
    tierModel("DECRYPTO_JUDGE_SMART", "smart"),
  ];
}

// ---------------------------------------------------------------------------
// Probability tables over codes (pure)
// ---------------------------------------------------------------------------

/** Any four numbers (percent or not) → a floored distribution. */
export function normalizeRow(raw: readonly number[]): Row {
  const vals = [0, 1, 2, 3].map((i) => {
    const v = Number(raw[i]);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  const sum = vals.reduce((a, b) => a + b, 0);
  const base = sum > 0 ? vals.map((v) => v / sum) : [0.25, 0.25, 0.25, 0.25];
  const floored = base.map((v) => Math.max(v, ROW_FLOOR));
  const total = floored.reduce((a, b) => a + b, 0);
  return floored.map((v) => v / total) as Row;
}

/** The element-wise mean of several rows. */
export function meanRow(rows: readonly Row[]): Row {
  if (rows.length === 0) return [0.25, 0.25, 0.25, 0.25];
  return normalizeRow([0, 1, 2, 3].map((i) => rows.reduce((a, r) => a + r[i], 0)));
}

/** The chance a guesser reading these three rows names `code`, over the 24 legal codes. */
export function codeChance(rows: readonly [Row, Row, Row], code: readonly number[]): number {
  let total = 0;
  let mine = 0;
  for (const c of ALL_CODES) {
    const l = rows[0][c[0] - 1] * rows[1][c[1] - 1] * rows[2][c[2] - 1];
    total += l;
    if (c[0] === code[0] && c[1] === code[1] && c[2] === code[2]) mine = l;
  }
  return total > 0 ? mine / total : 0;
}

/** The likeliest legal code for three rows. */
export function likeliestCode(rows: readonly [Row, Row, Row]): Code {
  let best: readonly number[] = ALL_CODES[0] as readonly number[];
  let bestL = -1;
  for (const c of ALL_CODES) {
    const l = rows[0][c[0] - 1] * rows[1][c[1] - 1] * rows[2][c[2] - 1];
    if (l > bestL) {
      bestL = l;
      best = c;
    }
  }
  return [...best] as unknown as Code;
}

/** What each token would cost this team now, in ordinary tokens. */
export function tokenCosts(input: EncryptInput): Costs {
  const { own, opp } = input.tokens;
  const second = (held: number) => (held >= 1 ? LOSING_TOKEN : 1);
  // In the 3-player variant a miscommunication also feeds the interceptor's pool.
  const pool = input.variant === "interceptor" ? second(opp.interceptions) : 0;
  return {
    miscommunication: second(own.miscommunications) + pool,
    // Round 1 has no interception attempts.
    interception: input.round > 1 ? second(opp.interceptions) : 0,
    // A keyword the rival can name makes its later clues interceptable.
    exposure: EXPOSURE_COST,
  };
}

export interface Costs {
  miscommunication: number;
  interception: number;
  /** Per keyword this transmission newly gives away. */
  exposure: number;
}

export interface Scored {
  clues: Triple;
  decode: number;
  intercept: number;
  /** Keywords newly given away, summed over the three clues. */
  exposure: number;
  value: number;
}

/** A triple's value: the expected token cost, negated. */
export function tripleValue(decode: number, intercept: number, costs: Costs, exposure = 0): number {
  return (
    -costs.miscommunication * (1 - decode) -
    costs.interception * intercept -
    costs.exposure * exposure
  );
}

export interface Candidate {
  clue: string;
  /** Chances the decoder files it under each keyword. */
  decode: Row;
  /** Chances the interceptor files it under each column (uniform before round 2). */
  intercept: Row;
  /** How much more nameable the keyword becomes once this clue is public (0–1). */
  exposure: number;
}

/** Every combination of one candidate per position, best first (distinct clues only). */
export function rankTriples(
  pools: readonly [Candidate[], Candidate[], Candidate[]],
  code: readonly number[],
  costs: Costs,
): Scored[] {
  const out: Scored[] = [];
  for (const a of pools[0]) {
    for (const b of pools[1]) {
      if (b.clue === a.clue) continue;
      for (const c of pools[2]) {
        if (c.clue === a.clue || c.clue === b.clue) continue;
        const decode = codeChance([a.decode, b.decode, c.decode], code);
        const intercept = codeChance([a.intercept, b.intercept, c.intercept], code);
        const exposure = a.exposure + b.exposure + c.exposure;
        out.push({
          clues: [a.clue, b.clue, c.clue],
          decode,
          intercept,
          exposure,
          value: tripleValue(decode, intercept, costs, exposure),
        });
      }
    }
  }
  return out.sort((x, y) => y.value - x.value);
}

/** Legal on its own: non-empty, short, never used by the team, no keyword as a word. */
export function legalCandidate(clue: string, input: EncryptInput): boolean {
  const n = normalizeClue(clue);
  if (n.length === 0 || clue.trim().length > MAX_CLUE_LENGTH) return false;
  if (input.forbiddenClues.includes(n)) return false;
  const words = clueWords(n);
  return !input.keywords.some((k) => {
    const kw = k.toLowerCase();
    return words.some((w) => w === kw || w === `${kw}s`);
  });
}

// ---------------------------------------------------------------------------
// 1. Candidates
// ---------------------------------------------------------------------------

const BRAINSTORM_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    positions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      description: "One entry per code position, in code order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          digit: { type: "integer", enum: [1, 2, 3, 4] },
          candidates: {
            type: "array",
            minItems: 1,
            maxItems: PER_LENS,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                facet: { type: "string", description: "The angle, in a few words." },
                clue: { type: "string" },
              },
              required: ["facet", "clue"],
            },
          },
        },
        required: ["digit", "candidates"],
      },
    },
  },
  required: ["positions"],
};

const RawBrainstorm = z.object({
  positions: z
    .array(
      z.object({
        digit: z.number().int(),
        candidates: z.array(z.object({ facet: z.string(), clue: z.string() })),
      }),
    )
    .length(3),
});

interface Lens {
  name: string;
  model: () => string;
  effort: Effort;
  text: string;
}

const LENSES: readonly Lens[] = [
  {
    name: "craft",
    model: smartModel,
    effort: "medium",
    text: "Your strongest candidates by the checklist — each one a different, unused facet.",
  },
  {
    name: "decoy",
    model: smartModel,
    effort: "medium",
    text: `MISDIRECTION. Candidates that an outsider holding only the public table would
file under a DIFFERENT column (or under none) — yet that a teammate who knows the four
keywords reads unmistakably as the true keyword. Name, in the facet, which column the
clue leans toward for an outsider. Before round 2 (empty columns) give simply your most
oblique clues a teammate still reads with certainty.`,
  },
  {
    name: "fresh",
    model: balancedModel,
    effort: "medium",
    text: `FRESH ANGLES. Skip the first ideas that come to mind — reach for idiom, history,
a famous example, science, pop culture, a material, a sound, a metaphor. Every candidate
must still point at its keyword over your other three.`,
  },
  {
    name: "wide",
    model: smartModel,
    effort: "medium",
    text: `WIDE CLUES. Candidates that would fit dozens of different words for an outsider —
an outsider could never name the keyword from them — yet among YOUR FOUR keywords only
one fits. Check each against your other three keywords: if it fits two of them, drop it.`,
  },
];

function brainstormSystem(lens: Lens): string {
  return `${encryptSystem()}

THE MASTERMIND'S PRINCIPLE. Your teammate only has to choose among YOUR FOUR keywords;
the rival has to work out the WORD itself from the public column. So the ideal clue fits
many possible words for an outsider, yet only one of your four. Never give the keyword's
defining feature, a near-synonym or its most famous example: that hands the rival the
keyword, and from then on every clue for that digit is easy to intercept. This holds in
round 1 too — every clue becomes public and stays on the table all game.

THIS TASK: you are not committing yet. Propose up to ${PER_LENS} CANDIDATE clues for each
position of the code; a search will test them on simulated teammates and interceptors and
keep the best combination. Make the candidates for one position genuinely different from
each other (different facets), all following the hard rules.

LENS — ${lens.text}`;
}

async function brainstorm(input: EncryptInput, lens: Lens): Promise<string[][]> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: `decrypto:master:${lens.name}`,
      modelOverride: lens.model(),
      system: brainstormSystem(lens),
      user: encryptUser(input),
      schemaName: "decrypto_candidates",
      jsonSchema: BRAINSTORM_JSON_SCHEMA,
      budgetMs: BRAINSTORM_MS,
      reasoningEffort: lens.effort,
    }),
  );
  const parsed = RawBrainstorm.parse(raw);
  // Positions by their digit when the model kept them; by order otherwise.
  return input.code.map((digit, i) => {
    const byDigit = parsed.positions.find((p) => p.digit === digit);
    const pos = byDigit ?? parsed.positions[i];
    return (pos?.candidates ?? []).map((c) => c.clue.trim());
  });
}

/** Per position, the distinct legal candidates every lens offered (first-seen order). */
export function poolCandidates(input: EncryptInput, offers: readonly string[][][]): string[][] {
  return [0, 1, 2].map((pos) => {
    const seen = new Set<string>();
    const out: string[] = [];
    // Round-robin over the lenses, so a capped pool keeps every lens's best.
    const depth = Math.max(0, ...offers.map((o) => o[pos]?.length ?? 0));
    for (let rank = 0; rank < depth && out.length < MAX_POOL; rank++) {
      for (const offer of offers) {
        const clue = offer[pos]?.[rank];
        if (clue === undefined || out.length >= MAX_POOL) continue;
        const n = normalizeClue(clue);
        if (seen.has(n) || !legalCandidate(clue, input)) continue;
        seen.add(n);
        out.push(clue);
      }
    }
    return out;
  });
}

/**
 * Reading groups: the g-th candidate of every position. A reader shown a whole
 * pool at once sees a dozen clues for ONE keyword and names it from the list
 * itself; a group's clues point at three different keywords.
 */
export function readingGroups(
  pools: readonly string[][],
): { pos: number; j: number; clue: string }[][] {
  const depth = Math.max(0, ...pools.map((p) => p.length));
  const groups: { pos: number; j: number; clue: string }[][] = [];
  for (let j = 0; j < depth; j++) {
    const group = pools.flatMap((pool, pos) => {
      const clue = pool[j];
      return clue === undefined ? [] : [{ pos, j, clue }];
    });
    groups.push(group);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 2. Readers
// ---------------------------------------------------------------------------

const READ_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    columns: {
      type: "string",
      description:
        "One line per digit: what it stands for (your keyword, or — reading a rival's table — your best guess at its column's concept).",
    },
    reads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          i: { type: "integer", description: "The candidate's number." },
          pct: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "integer" },
            description: "Your chances (percent, summing to 100) for digits 1, 2, 3, 4.",
          },
        },
        required: ["i", "pct"],
      },
    },
  },
  required: ["columns", "reads"],
};

const RawRead = z.object({
  columns: z.string(),
  reads: z.array(z.object({ i: z.number().int(), pct: z.array(z.number()) })),
});

function readerSystem(purpose: "decode" | "intercept"): string {
  const who =
    purpose === "decode"
      ? `You are about to DECODE your own encryptor's clues. You know your four keywords and
your team's clue table (and your past misreads).`
      : `You are about to INTERCEPT a rival team's clues. You never see their keywords: only
their public clue table, grouped by digit.`;
  return `You are an expert Decrypto player. ${who}

${RULES_PRIMER}

Below is a numbered list of single candidate clues. Read EACH ONE ALONE, as if it were
the clue in front of you: how likely would you file it under digit 1, 2, 3 or 4? Give
honest percentages summing to 100 — certainty only when nothing else fits. ${
    purpose === "intercept"
      ? "Write your reading of every column's concept first; clues that fit no column point to the emptiest ones."
      : "Weigh the other three keywords seriously before you commit to one."
  }`;
}

function readerUser(input: EncryptInput, purpose: "decode" | "intercept", clues: string[]): string {
  const sections = [
    `ROUND: ${input.round}`,
    `THE TEAM'S PUBLIC CLUE TABLE:\n${digitTable(input.ownRevealedClues)}`,
  ];
  if (purpose === "decode") {
    sections.unshift(
      `YOUR TEAM'S KEYWORDS:\n${input.keywords.map((k, i) => `  #${i + 1}: ${k}`).join("\n")}`,
    );
    sections.push(`YOUR TEAM'S PAST MISREADS:\n${mistakesText(input.ownDecodeMistakes)}`);
  }
  sections.push(`CANDIDATES:\n${clues.map((c, i) => `  ${i + 1}. "${c}"`).join("\n")}`);
  return sections.join("\n\n");
}

/** One reader's rows for every clue (in order); a clue it skipped reads as uniform. */
async function read(
  input: EncryptInput,
  purpose: "decode" | "intercept",
  model: string,
  clues: string[],
): Promise<Row[]> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: `decrypto:master:read-${purpose}`,
      modelOverride: model,
      system: readerSystem(purpose),
      user: readerUser(input, purpose, clues),
      schemaName: "decrypto_reads",
      jsonSchema: READ_JSON_SCHEMA,
      budgetMs: READ_MS,
      reasoningEffort: "low",
    }),
  );
  const parsed = RawRead.parse(raw);
  const rows: Row[] = clues.map(() => normalizeRow([1, 1, 1, 1]));
  for (const r of parsed.reads) {
    if (r.i >= 1 && r.i <= clues.length) rows[r.i - 1] = normalizeRow(r.pct);
  }
  return rows;
}

/** The readers standing in for the decoder and the interceptor. */
export function readersFor(
  input: EncryptInput,
  modelForTier: (tier: string) => string,
): { decode: string[]; intercept: string[] } {
  const people = peopleModels();
  return {
    // A person decodes: three people of different strength, averaged.
    decode: input.decoder === null ? people : [modelForTier(input.decoder)],
    // A person intercepts: the balanced and the smart reader.
    intercept:
      input.round <= 1
        ? []
        : input.interceptor === null
          ? people.slice(1)
          : [modelForTier(input.interceptor)],
  };
}

// ---------------------------------------------------------------------------
// 2b. Exposure: can the rival name the keyword once the clue is public?
// ---------------------------------------------------------------------------

const EXPOSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    guesses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          i: { type: "integer", description: "The item's number." },
          words: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { type: "string" },
            description: "Your three best guesses at the hidden keyword, best first.",
          },
        },
        required: ["i", "words"],
      },
    },
  },
  required: ["guesses"],
};

const RawExpose = z.object({
  guesses: z.array(z.object({ i: z.number().int(), words: z.array(z.string()) })),
});

const EXPOSE_SYSTEM = `You are an expert Decrypto player studying a rival team's public clue table.
Every column hides one secret keyword (a common noun); each clue evokes that keyword's
meaning from some angle. For each numbered item — one column's clues — name your three
best guesses at the hidden keyword, best first. Single words.`;

function sameWord(guess: string, keyword: string): boolean {
  const g = guess.toLowerCase().replace(/[^a-zà-ÿ]/g, "");
  const k = keyword.toLowerCase().replace(/[^a-zà-ÿ]/g, "");
  if (g.length === 0) return false;
  return g === k || g === `${k}s` || `${g}s` === k || g === `${k}es` || `${g}es` === k;
}

/** How nameable a keyword is from the rival's guesses: first guess 1, second 0.6, third 0.4. */
export function nameability(words: readonly string[], keyword: string): number {
  const weights = [1, 0.6, 0.4];
  let best = 0;
  words.slice(0, 3).forEach((w, i) => {
    if (sameWord(w, keyword)) best = Math.max(best, weights[i] ?? 0);
  });
  return best;
}

/** One reader's guesses at the keyword behind each item (a column's clues), as nameability 0–1. */
async function nameItems(
  model: string,
  items: readonly { text: string; keyword: string }[],
  ms: number,
): Promise<number[]> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: "decrypto:master:expose",
      modelOverride: model,
      system: EXPOSE_SYSTEM,
      user: `ITEMS:\n${items.map((it, i) => `  ${i + 1}. ${it.text}`).join("\n")}`,
      schemaName: "decrypto_expose",
      jsonSchema: EXPOSE_JSON_SCHEMA,
      budgetMs: ms,
      reasoningEffort: "low",
    }),
  );
  const byItem = new Map(RawExpose.parse(raw).guesses.map((g) => [g.i, g.words]));
  return items.map((it, i) => nameability(byItem.get(i + 1) ?? [], it.keyword));
}

/**
 * Per candidate, how much more nameable its keyword becomes when it joins its
 * column (0 when the column already gives the keyword away), averaged over
 * readers. Read in groups of three different keywords (`readingGroups`).
 */
async function exposures(
  input: EncryptInput,
  pools: readonly string[][],
  models: readonly string[],
  ms: number,
): Promise<number[][]> {
  const columnText = (digit: number, extra?: string) => {
    const clues = input.ownRevealedClues.filter((c) => c.digit === digit).map((c) => `"${c.clue}"`);
    if (extra) clues.push(`"${extra}"`);
    return clues.length > 0 ? clues.join(", ") : "(no clues)";
  };
  const digitAt = (pos: number) => input.code[pos] ?? 1;
  const keywordAt = (pos: number) => input.keywords[digitAt(pos) - 1] ?? "";
  const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

  // The columns as they stand (only those with history can already give a keyword away).
  const standing = [0, 1, 2].filter((pos) =>
    input.ownRevealedClues.some((c) => c.digit === digitAt(pos)),
  );
  const baseItems = standing.map((pos) => ({
    text: columnText(digitAt(pos)),
    keyword: keywordAt(pos),
  }));
  const groups = readingGroups(pools);
  const [baseReads, groupReads] = await Promise.all([
    baseItems.length === 0
      ? Promise.resolve([] as number[][])
      : settledBy(
          models.map((m) => nameItems(m, baseItems, ms)),
          ms,
        ),
    Promise.all(
      groups.map((group) =>
        settledBy(
          models.map((m) =>
            nameItems(
              m,
              group.map((g) => ({
                text: columnText(digitAt(g.pos), g.clue),
                keyword: keywordAt(g.pos),
              })),
              ms,
            ),
          ),
          ms,
        ),
      ),
    ),
  ]);
  const base = [0, 1, 2].map((pos) => {
    const at = standing.indexOf(pos);
    return at === -1 ? 0 : mean(baseReads.map((r) => r[at] ?? 0));
  });
  const out = pools.map((pool) => pool.map(() => 0));
  groups.forEach((group, gi) => {
    const reads = groupReads[gi] ?? [];
    group.forEach((g, k) => {
      const row = out[g.pos];
      if (row) row[g.j] = Math.max(0, mean(reads.map((r) => r[k] ?? 0)) - (base[g.pos] ?? 0));
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 4. Play-outs
// ---------------------------------------------------------------------------

function decodeInputFor(input: EncryptInput, clues: Triple, tier: string): GuessInput {
  return {
    model: tier,
    purpose: "decode",
    keywords: input.keywords,
    currentClues: clues,
    targetRevealedClues: input.ownRevealedClues,
    pastDecodeMistakes: input.ownDecodeMistakes,
    round: input.round,
  };
}

function interceptInputFor(input: EncryptInput, clues: Triple, tier: string): GuessInput {
  return {
    model: tier,
    purpose: "intercept",
    keywords: null,
    currentClues: clues,
    targetRevealedClues: input.ownRevealedClues,
    pastDecodeMistakes: [],
    round: input.round,
  };
}

function sameCode(a: readonly number[], b: readonly number[]): boolean {
  return a.length === 3 && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

interface PlayResult {
  hits: number;
  tries: number;
}

async function playOut(
  input: EncryptInput,
  triple: Scored,
  deps: MastermindDeps,
  purpose: "decode" | "intercept",
  ms: number,
): Promise<PlayResult> {
  const tier = purpose === "decode" ? input.decoder : input.interceptor;
  const build = purpose === "decode" ? decodeInputFor : interceptInputFor;
  const runs: Promise<readonly number[]>[] =
    tier === null
      ? (purpose === "decode" ? peopleModels() : peopleModels().slice(1)).map((model) =>
          withSlot(() => deps.guessWithModel(model, build(input, triple.clues, "person"), "low")),
        )
      : [deps.guessAs(tier, build(input, triple.clues, tier))];
  const answers = await settledBy(runs, ms);
  return {
    hits: answers.filter((code) => sameCode(code, input.code)).length,
    tries: answers.length,
  };
}

/** The estimate moved by what really happened. */
export function blend(estimate: number, result: PlayResult): number {
  return (estimate * PRIOR_WEIGHT + result.hits) / (PRIOR_WEIGHT + result.tries);
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

export interface MastermindTrace {
  candidates: number[];
  played: (Scored & { decodeHits: string; interceptHits: string })[];
  picked: Scored;
  ms: number;
}

/** Recent searches' working by the clues they gave (benches read it; bounded). */
const traces = new Map<string, MastermindTrace>();
export function mastermindTraceFor(clues: readonly string[]): MastermindTrace | undefined {
  return traces.get(clues.join("|"));
}

export async function mastermindEncrypt(
  input: EncryptInput,
  deps: MastermindDeps & { modelForTier?: (tier: string) => string },
): Promise<Triple> {
  const started = Date.now();
  const left = () => started + SEARCH_MS - Date.now();
  const modelForTier = deps.modelForTier ?? (() => smartModel());

  // 1. Candidates.
  const offers = await settledBy(
    LENSES.map((lens) => brainstorm(input, lens)),
    Math.min(BRAINSTORM_MS, left()),
  );
  const pools = poolCandidates(input, offers);
  if (pools.some((p) => p.length === 0)) return deps.oneCallEncrypt(input);

  // 2. Readers: in groups of three different keywords, so no list gives a keyword away.
  const groups = readingGroups(pools);
  const readers = readersFor(input, modelForTier);
  /** One reader's rows for every candidate, by position; null when nothing arrived. */
  const readAll = async (purpose: "decode" | "intercept", model: string, ms: number) => {
    const parts = await Promise.all(
      groups.map((group) =>
        settledBy(
          [
            read(
              input,
              purpose,
              model,
              group.map((g) => g.clue),
            ),
          ],
          ms,
        ).then((r) => r[0] ?? null),
      ),
    );
    if (parts.every((p) => p === null)) throw new Error(`no ${purpose} read arrived`);
    const uniformRow = normalizeRow([1, 1, 1, 1]);
    const rows = pools.map((pool) => pool.map(() => uniformRow));
    groups.forEach((group, gi) => {
      group.forEach((g, k) => {
        const row = rows[g.pos];
        if (row) row[g.j] = parts[gi]?.[k] ?? uniformRow;
      });
    });
    return rows;
  };
  const exposeModels =
    input.interceptor === null ? peopleModels().slice(1) : [modelForTier(input.interceptor)];
  const [decodeReads, interceptReads, exposed] = await Promise.all([
    settledBy(
      readers.decode.map((m) => readAll("decode", m, Math.min(READ_MS, left()))),
      Math.min(READ_MS, left()) + 1_000,
    ),
    settledBy(
      readers.intercept.map((m) => readAll("intercept", m, Math.min(READ_MS, left()))),
      Math.min(READ_MS, left()) + 1_000,
    ),
    exposures(input, pools, exposeModels, Math.min(READ_MS, left())),
  ]);
  if (decodeReads.length === 0) return deps.oneCallEncrypt(input);
  const uniform = normalizeRow([1, 1, 1, 1]);
  const candidates = pools.map((pool, pos) =>
    pool.map((clue, j) => ({
      clue,
      exposure: exposed[pos]?.[j] ?? 0,
      decode: meanRow(decodeReads.map((rows) => rows[pos]?.[j] ?? uniform)),
      intercept:
        interceptReads.length > 0
          ? meanRow(interceptReads.map((rows) => rows[pos]?.[j] ?? uniform))
          : uniform,
    })),
  ) as [Candidate[], Candidate[], Candidate[]];

  if (process.env.DECRYPTO_MASTER_DEBUG) {
    for (const [pos, pool] of candidates.entries()) {
      console.log(
        `[master] position ${pos + 1} (#${input.code[pos]} ${input.keywords[(input.code[pos] ?? 1) - 1]})`,
      );
      for (const c of pool) {
        const digit = (input.code[pos] ?? 1) - 1;
        console.log(
          `   ${c.clue.padEnd(34)} dec ${(c.decode[digit] ?? 0).toFixed(2)} int ${(c.intercept[digit] ?? 0).toFixed(2)} exp ${c.exposure.toFixed(2)}`,
        );
      }
    }
  }

  // 3. The triple.
  const costs = tokenCosts(input);
  const ranked = rankTriples(candidates, input.code, costs);
  const top = ranked[0];
  if (!top) return deps.oneCallEncrypt(input);

  // 4. Play-outs of the leaders (distinct triples), within what's left. When
  // every played triple did worse than the next one's estimate, another wave
  // plays the next leaders (up to PLAY_WAVES), time permitting.
  let picked: Scored | null = null;
  const played: MastermindTrace["played"] = [];
  const playOne = async (t: Scored, ms: number): Promise<Scored> => {
    const [dec, int] = await Promise.all([
      playOut(input, t, deps, "decode", ms),
      costs.interception > 0
        ? playOut(input, t, deps, "intercept", ms)
        : Promise.resolve({ hits: 0, tries: 0 }),
    ]);
    const decode = blend(t.decode, dec);
    const intercept = costs.interception > 0 ? blend(t.intercept, int) : t.intercept;
    const rescored: Scored = {
      clues: t.clues,
      decode,
      intercept,
      exposure: t.exposure,
      value: tripleValue(decode, intercept, costs, t.exposure),
    };
    played.push({
      ...rescored,
      decodeHits: `${dec.hits}/${dec.tries}`,
      interceptHits: `${int.hits}/${int.tries}`,
    });
    return rescored;
  };
  for (let wave = 0; wave < PLAY_WAVES; wave++) {
    const next = ranked.slice(wave * PLAY_TRIPLES, (wave + 1) * PLAY_TRIPLES);
    const ms = left();
    if (next.length === 0 || ms < (wave === 0 ? 8_000 : 14_000)) break;
    // A later wave only when what was played fell below the next estimate.
    if (picked && (next[0]?.value ?? -Infinity) <= picked.value) break;
    const results = await Promise.all(next.map((t) => playOne(t, ms)));
    for (const r of results) if (!picked || r.value > picked.value) picked = r;
  }
  picked ??= top;
  traces.set(picked.clues.join("|"), {
    candidates: pools.map((p) => p.length),
    played,
    picked,
    ms: Date.now() - started,
  });
  if (traces.size > 200) traces.delete(traces.keys().next().value as string);
  return picked.clues;
}

// ---------------------------------------------------------------------------
// Guessing: an ensemble of probability tables
// ---------------------------------------------------------------------------

const TABLE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    columns: {
      type: "string",
      description:
        "One line per digit: what it stands for (your keyword, or — intercepting — your best guess at the column's concept from its clues).",
    },
    rows: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      description: "One entry per clue, in clue order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          clue: { type: "string" },
          reasoning: { type: "string", description: "One terse sentence." },
          pct: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "integer" },
            description:
              "Your honest chances (percent, summing to 100) that this clue means digit 1, 2, 3, 4 — taking the other two clues into account (the three digits are different).",
          },
        },
        required: ["clue", "reasoning", "pct"],
      },
    },
  },
  required: ["columns", "rows"],
};

const RawTable = z.object({
  columns: z.string(),
  rows: z.array(z.object({ clue: z.string(), pct: z.array(z.number()) })).length(3),
});

function tableSystem(purpose: "decode" | "intercept"): string {
  return `${purpose === "decode" ? decodeSystem() : interceptSystem()}

ANSWER AS A PROBABILITY TABLE, not a single code: for each clue, your honest chances
over the four digits. Calibrated chances matter more than a confident pick — they are
combined with other readers' tables before the code is chosen.`;
}

/** The lineup of table readers: two smart reads and one balanced. */
function tableModels(): { model: string; effort: Effort }[] {
  return [
    { model: smartModel(), effort: "medium" },
    { model: smartModel(), effort: "low" },
    { model: balancedModel(), effort: "medium" },
  ];
}

async function readTable(
  input: GuessInput,
  model: string,
  effort: Effort,
): Promise<[Row, Row, Row]> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: `decrypto:master:${input.purpose}`,
      modelOverride: model,
      system: tableSystem(input.purpose),
      user: guessUser(input),
      schemaName: "decrypto_table",
      jsonSchema: TABLE_JSON_SCHEMA,
      budgetMs: GUESS_MS,
      reasoningEffort: effort,
    }),
  );
  const parsed = RawTable.parse(raw);
  return parsed.rows.map((r) => normalizeRow(r.pct)) as [Row, Row, Row];
}

export async function mastermindGuess(input: GuessInput): Promise<Code> {
  const tables = await settledBy(
    tableModels().map(({ model, effort }) => readTable(input, model, effort)),
    GUESS_MS,
  );
  if (tables.length === 0) throw new Error("no probability table arrived in time");
  const rows = [0, 1, 2].map((i) => meanRow(tables.map((t) => t[i] as Row))) as [Row, Row, Row];
  return likeliestCode(rows);
}
