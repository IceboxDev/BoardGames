import { AsyncLocalStorage } from "node:async_hooks";
import type { EncryptInput, GuessInput } from "@boardgames/core/games/decrypto/ai/agent";
import { type ClueNote, type GuessNote, noteText } from "@boardgames/core/games/decrypto/notes";
import { ALL_CODES, clueWords, normalizeClue } from "@boardgames/core/games/decrypto/rules";
import { type Code, MAX_CLUE_LENGTH } from "@boardgames/core/games/decrypto/types";
import { z } from "zod";
import { causeChain, structuredGenerate, tierModel } from "../lib/ai";
import {
  decodeSystem,
  digitTable,
  encryptSystem,
  encryptUser,
  GUESS_JSON_SCHEMA,
  guessUser,
  interceptSystem,
  mistakesText,
  RawGuessSchema,
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
  /** The same floor with its note, when the caller keeps notes. */
  oneCallEncryptNoted?(input: EncryptInput): Promise<{ clues: Triple; note: ClueNote }>;
}

export interface NotedTriple {
  clues: Triple;
  note: ClueNote;
}

export interface NotedCode {
  code: Code;
  note: GuessNote;
}

/** The whole encrypt search answers by this; the machine races 120 s. */
const SEARCH_MS = Number(process.env.DECRYPTO_MASTER_SEARCH_MS) || 92_000;
const BRAINSTORM_MS = 48_000;
const READ_MS = 24_000;
const GUESS_MS = 45_000;
/** A guess's candidates must arrive by this; the adjudication gets the rest of GUESS_TOTAL_MS. */
const CANDIDATE_MS = 25_000;
/** Inside the machine's 60 s guess race, with room to spare. */
const GUESS_TOTAL_MS = 52_000;
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
const waiting: { priority: number; resolve: () => void }[] = [];

/**
 * Which search a call belongs to: its start time. Waiting calls are served
 * oldest search first, so with several searches at once (an all-AI room, two
 * rooms) the earliest finishes inside its budget instead of every search's
 * phases interleaving in one queue and all of them missing their deadlines.
 * Carried implicitly through every nested call (play-outs included).
 */
const searchStart = new AsyncLocalStorage<number>();

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) {
    const priority = searchStart.getStore() ?? Date.now();
    await new Promise<void>((resolve) => {
      waiting.push({ priority, resolve });
      waiting.sort((a, b) => a.priority - b.priority);
    });
  }
  running++;
  try {
    return await run();
  } finally {
    running--;
    waiting.shift()?.resolve();
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
                link: {
                  type: "string",
                  description:
                    "After choosing: how the clue leads a teammate to the keyword, in a short phrase.",
                },
              },
              required: ["facet", "clue", "link"],
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
        candidates: z.array(
          z.object({ facet: z.string(), clue: z.string(), link: z.string().optional() }),
        ),
      }),
    )
    .min(1),
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

// ── Experimental variants (bench only) ─────────────────────────────────────
//
// A Mastermind seat's strategy string may carry flags after a colon,
// "decrypto-expert:joint+sets", read only when DECRYPTO_BENCH_VARIANTS=1 —
// how the bench plays one search against another in the same process.

export interface MasterVariant {
  /** Extra brainstorm lenses by name (EXTRA_LENSES). */
  lenses: string[];
  /** Whole triples built along one axis, judged jointly. */
  sets: boolean;
  /** Finalists judged by joint reads of the whole triple. */
  joint: boolean;
  /** Triples played out (PLAY_TRIPLES by default). */
  playTriples: number;
  /** Real-interceptor samples per played triple when an AI intercepts. */
  interceptSamples: number;
  /** Weight of the reader's estimate against each real play-out (PRIOR_WEIGHT). */
  priorWeight: number;
}

/** The variant the search plays by default (flags that won their bench). */
const DEFAULT_VARIANT: MasterVariant = {
  lenses: [],
  sets: false,
  joint: false,
  playTriples: PLAY_TRIPLES,
  interceptSamples: 1,
  priorWeight: PRIOR_WEIGHT,
};

export function variantOf(model: string): MasterVariant {
  if (process.env.DECRYPTO_BENCH_VARIANTS !== "1" || !model.includes(":")) return DEFAULT_VARIANT;
  const flags = model
    .slice(model.indexOf(":") + 1)
    .split("+")
    .filter(Boolean);
  const v: MasterVariant = { ...DEFAULT_VARIANT, lenses: [] };
  for (const f of flags) {
    if (f === "sets") {
      v.sets = true;
      v.joint = true;
    } else if (f === "jfinal") v.joint = true;
    else if (f === "base") continue;
    else if (f === "deep") {
      // Trust the real interceptor's pipeline over the quick reads.
      v.joint = true;
      v.playTriples = 6;
      v.interceptSamples = 2;
      v.priorWeight = 0.5;
    } else if (f === "play6") v.playTriples = 6;
    else if (f === "isamp2") v.interceptSamples = 2;
    else if (f === "trust") v.priorWeight = 0.5;
    else v.lenses.push(f);
  }
  return v;
}

const EXTRA_LENSES: Record<string, Lens> = {
  joint: {
    name: "joint",
    model: smartModel,
    effort: "medium",
    text: `JOINT RESOLUTION. Your teammate reads the three clues TOGETHER, knowing they are three
DIFFERENT keywords. So a clue may honestly fit TWO of your keywords, as long as the other
keyword it fits is clued unmistakably elsewhere in this same code — your teammate resolves
it by elimination, while an outsider, who can't eliminate, is left with an ambiguous clue.
Example: keywords CAT DOG FISH BIRD, code 1-2-3: "fur" (cat or dog), "leash" (dog), "gills"
(fish) — "fur" is cat once "leash" takes dog. Give such deliberately two-way candidates for
each position, naming in the facet which other keyword it also fits and which position
resolves it.`,
  },
  prism: {
    name: "prism",
    model: smartModel,
    effort: "medium",
    text: `SEMANTIC PRISM. List every distinct SENSE or identity of the keyword — homonyms, verb vs
noun, idioms, technical meanings, brands, places, people, titles named after it (BANK: river
edge, money, a shot in billiards, to tilt a plane; MERCURY: planet, element, god, Freddie,
thermometer). Give candidates that each come from a sense the column has NOT used yet, so
the public column jumps between unrelated identities and never converges on one concept.`,
  },
  trail: {
    name: "trail",
    model: smartModel,
    effort: "medium",
    text: `FALSE TRAIL. Look at your OTHER columns' public clues: give candidates for this position
that also fit the visible theme of a DIFFERENT column — a false positive an outsider will
file there — while your teammate, who knows the keywords, still reads them as the true one.
(TRIANGLE was clued "equilateral"; clue POLITICS with "unilateral" — an outsider files it
under the triangle column.) Name in the facet which column it baits.`,
  },
};

function lensesFor(variant: MasterVariant): Lens[] {
  return [...LENSES, ...variant.lenses.flatMap((n) => (EXTRA_LENSES[n] ? [EXTRA_LENSES[n]] : []))];
}

// Whole triples along one axis: the clues share a category, so each is read
// against the other two ("bicycle / tricycle / quadricycle" counts 2-3-4).

const SETS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sets: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          axis: { type: "string", description: "The shared category, in a few words." },
          clues: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { type: "string" },
            description: "One clue per code position, in code order.",
          },
        },
        required: ["axis", "clues"],
      },
    },
  },
  required: ["sets"],
};

const RawSets = z.object({
  sets: z.array(z.object({ axis: z.string(), clues: z.array(z.string()).min(3) })),
});

const SETS_TEXT = `SAME AXIS. Build WHOLE TRANSMISSIONS: pick one category or axis (vehicles by wheel count,
animals, colours, famous duos, numbers, materials…) and clue all three positions with words
from that same axis, so each clue is read against the other two — the pattern points at
each keyword even when a single clue alone would not (EYES / TRIANGLE / CAR as BICYCLE /
TRICYCLE / QUADRICYCLE: two, three, four). Every clue must still pick its keyword out of
your four for a teammate who sees the whole set. A good axis also poisons the public table:
it sends the same theme into three columns at once. Propose up to 4 different sets.`;

async function brainstormSets(input: EncryptInput): Promise<Triple[]> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: "decrypto:master:sets",
      modelOverride: smartModel(),
      system: `${encryptSystem()}\n\nTHIS TASK — ${SETS_TEXT}`,
      user: encryptUser(input),
      schemaName: "decrypto_sets",
      jsonSchema: SETS_JSON_SCHEMA,
      budgetMs: BRAINSTORM_MS,
      reasoningEffort: "medium",
    }),
  );
  return RawSets.parse(raw)
    .sets.map((set) => set.clues.slice(0, 3).map((c) => c.trim()) as Triple)
    .filter(
      (t) => t.every((c) => legalCandidate(c, input)) && new Set(t.map(normalizeClue)).size === 3,
    );
}

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

async function brainstorm(
  input: EncryptInput,
  lens: Lens,
  links?: Map<string, string>,
): Promise<string[][]> {
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
    return (pos?.candidates ?? []).map((c) => {
      const clue = c.clue.trim();
      const link = c.link?.trim() || c.facet.trim();
      if (links && link && !links.has(clue.toLowerCase())) links.set(clue.toLowerCase(), link);
      return clue;
    });
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
  samples = 1,
): Promise<PlayResult> {
  const tier = purpose === "decode" ? input.decoder : input.interceptor;
  const build = purpose === "decode" ? decodeInputFor : interceptInputFor;
  const runs: Promise<readonly number[]>[] =
    tier === null
      ? (purpose === "decode" ? peopleModels() : peopleModels().slice(1)).map((model) =>
          withSlot(() => deps.guessWithModel(model, build(input, triple.clues, "person"), "low")),
        )
      : Array.from({ length: samples }, () => deps.guessAs(tier, build(input, triple.clues, tier)));
  const answers = await settledBy(runs, ms);
  return {
    hits: answers.filter((code) => sameCode(code, input.code)).length,
    tries: answers.length,
  };
}

/** The estimate moved by what really happened. */
export function blend(estimate: number, result: PlayResult, prior = PRIOR_WEIGHT): number {
  return (estimate * prior + result.hits) / (prior + result.tries);
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

/** Finalists the joint read judges. */
const JOINT_TOP = 6;
const JOINT_MS = 22_000;

/**
 * The finalists — the best independent triples and every same-axis set — read
 * as WHOLE transmissions, the way the decoder and interceptor will meet them:
 * each reader gives a probability table for the three clues together, so a
 * clue that only works beside the other two (an axis, an elimination) is
 * valued at last. The finalists come back ranked by those joint chances.
 */
async function jointRerank(
  input: EncryptInput,
  ranked: Scored[],
  sets: Triple[],
  readers: { decode: string[]; intercept: string[] },
  costs: Costs,
  modelForTier: (tier: string) => string,
  left: () => number,
): Promise<Scored[]> {
  const seen = new Set<string>();
  const finalists: { clues: Triple; exposure: number | null }[] = [];
  for (const t of ranked.slice(0, JOINT_TOP)) {
    seen.add(t.clues.join("|"));
    finalists.push({ clues: t.clues, exposure: t.exposure });
  }
  for (const t of sets) {
    if (seen.has(t.join("|"))) continue;
    seen.add(t.join("|"));
    finalists.push({ clues: t, exposure: null });
  }
  const ms = Math.min(JOINT_MS, left() - 8_000);
  const exposeModels =
    input.interceptor === null ? peopleModels().slice(1) : [modelForTier(input.interceptor)];
  const scored = await Promise.all(
    finalists.map(async (f) => {
      const [dec, int, exp] = await Promise.all([
        settledBy(
          readers.decode.map((m) => readTable(decodeInputFor(input, f.clues, "reader"), m, "low")),
          ms,
        ),
        costs.interception > 0
          ? settledBy(
              readers.intercept.map((m) =>
                readTable(interceptInputFor(input, f.clues, "reader"), m, "low"),
              ),
              ms,
            )
          : Promise.resolve([] as [Row, Row, Row][]),
        f.exposure !== null
          ? Promise.resolve(f.exposure)
          : exposures(
              input,
              f.clues.map((c) => [c]),
              exposeModels,
              ms,
            ).then((e) => e.reduce((a, row) => a + (row[0] ?? 0), 0)),
      ]);
      if (dec.length === 0) return null;
      const rowsOf = (tables: [Row, Row, Row][]) =>
        [0, 1, 2].map((i) => meanRow(tables.map((t) => t[i] as Row))) as [Row, Row, Row];
      const decode = codeChance(rowsOf(dec), input.code);
      const intercept = int.length > 0 ? codeChance(rowsOf(int), input.code) : 1 / 24;
      return {
        clues: f.clues,
        decode,
        intercept,
        exposure: exp,
        value: tripleValue(decode, intercept, costs, exp),
      } satisfies Scored;
    }),
  );
  const judged = scored.filter((s): s is Scored => s !== null);
  if (judged.length === 0) return ranked;
  return judged.sort((a, b) => b.value - a.value);
}

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
  return (await mastermindEncryptNoted(input, deps)).clues;
}

/** The search's clues with what it weighed — the debrief's note. */
export function mastermindEncryptNoted(
  input: EncryptInput,
  deps: MastermindDeps & { modelForTier?: (tier: string) => string },
): Promise<NotedTriple> {
  const started = Date.now();
  return searchStart.run(started, () => search(input, deps, started));
}

/** A one-call answer when the search found nothing to choose from. */
async function floorOf(input: EncryptInput, deps: MastermindDeps): Promise<NotedTriple> {
  if (deps.oneCallEncryptNoted) return deps.oneCallEncryptNoted(input);
  const clues = await deps.oneCallEncrypt(input);
  return {
    clues,
    note: {
      clues: clues.map(() => ({ link: null, cover: null })),
      tableRead: null,
      search: null,
      standIn: false,
      cost: null,
      traceIds: [],
    },
  };
}

/** Why the rival's reader shouldn't file a clue under its true column, from its read. */
export function coverLine(intercept: Row, digit: number, round: number): string | null {
  if (round < 2) return "Round 1: the rival has no table to read it against yet.";
  const truth = intercept[digit - 1] ?? 0;
  let lean = digit === 1 ? 1 : 0;
  for (let d = 0; d < 4; d++) {
    if (d !== digit - 1 && (intercept[d] ?? 0) > (intercept[lean] ?? 0)) lean = d;
  }
  const pct = (x: number) => `${Math.round(100 * x)}%`;
  const other = intercept[lean] ?? 0;
  return other > truth
    ? `A rival reader leans to column ${lean + 1} (${pct(other)}) — only ${pct(truth)} on the true one.`
    : `A rival reader already puts it on the true column (${pct(truth)}) — a risk taken for a clear read.`;
}

/** The search's working → its note. */
export function searchNote(
  input: EncryptInput,
  picked: Scored,
  candidates: readonly (readonly Candidate[])[],
  ranked: readonly Scored[],
  played: MastermindTrace["played"],
  links: ReadonlyMap<string, string>,
): ClueNote {
  const play = played.find((p) => p.clues.join("|") === picked.clues.join("|"));
  const alternatives: NonNullable<ClueNote["search"]>["alternatives"] = [];
  for (const r of ranked) {
    if (alternatives.length >= 2) break;
    if (r.clues.join("|") === picked.clues.join("|")) continue;
    alternatives.push({ clues: r.clues, decode: r.decode, intercept: r.intercept });
  }
  return {
    clues: picked.clues.map((clue, pos) => {
      const digit = input.code[pos] ?? 1;
      const cand = candidates[pos]?.find((c) => c.clue === clue);
      return {
        link: noteText(links.get(clue.toLowerCase())),
        cover: cand ? noteText(coverLine(cand.intercept, digit, input.round)) : null,
      };
    }),
    tableRead: null,
    search: {
      pooled: candidates.map((c) => Math.min(99, c.length)),
      decode: clamp01(picked.decode),
      intercept: clamp01(picked.intercept),
      exposure: Math.min(3, Math.max(0, picked.exposure)),
      playOut: play ? { decode: play.decodeHits, intercept: play.interceptHits } : null,
      alternatives: alternatives.map((a) => ({
        ...a,
        decode: clamp01(a.decode),
        intercept: clamp01(a.intercept),
      })),
    },
    standIn: false,
    cost: null,
    traceIds: [],
  };
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

async function search(
  input: EncryptInput,
  deps: MastermindDeps & { modelForTier?: (tier: string) => string },
  started: number,
): Promise<NotedTriple> {
  const left = () => started + SEARCH_MS - Date.now();
  const modelForTier = deps.modelForTier ?? (() => smartModel());
  const variant = variantOf(input.model);
  const links = new Map<string, string>();

  // 1. Candidates (and, with `sets`, whole same-axis triples beside them).
  const setsRun = variant.sets
    ? settledBy([brainstormSets(input)], Math.min(BRAINSTORM_MS, left())).then((r) => r[0] ?? [])
    : Promise.resolve([] as Triple[]);
  const offers = await settledBy(
    lensesFor(variant).map((lens) => brainstorm(input, lens, links)),
    Math.min(BRAINSTORM_MS, left()),
  );
  const setTriples = await setsRun;
  const pools = poolCandidates(input, offers);
  if (pools.some((p) => p.length === 0)) return floorOf(input, deps);

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
  if (decodeReads.length === 0) return floorOf(input, deps);
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
  let ranked = rankTriples(candidates, input.code, costs);
  let top = ranked[0];
  if (!top) return floorOf(input, deps);
  if (variant.joint && left() > 20_000) {
    ranked = await jointRerank(input, ranked, setTriples, readers, costs, modelForTier, left);
    top = ranked[0] ?? top;
  }

  // 4. Play-outs of the leaders (distinct triples), within what's left. When
  // every played triple did worse than the next one's estimate, another wave
  // plays the next leaders (up to PLAY_WAVES), time permitting.
  let picked: Scored | null = null;
  const played: MastermindTrace["played"] = [];
  const playOne = async (t: Scored, ms: number): Promise<Scored> => {
    const [dec, int] = await Promise.all([
      playOut(input, t, deps, "decode", ms),
      costs.interception > 0
        ? playOut(input, t, deps, "intercept", ms, variant.interceptSamples)
        : Promise.resolve({ hits: 0, tries: 0 }),
    ]);
    const decode = blend(t.decode, dec, variant.priorWeight);
    const intercept =
      costs.interception > 0 ? blend(t.intercept, int, variant.priorWeight) : t.intercept;
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
    const next = ranked.slice(wave * variant.playTriples, (wave + 1) * variant.playTriples);
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
  return {
    clues: picked.clues,
    note: searchNote(input, picked, candidates, ranked, played, links),
  };
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
  rows: z
    .array(
      z.object({ clue: z.string(), reasoning: z.string().optional(), pct: z.array(z.number()) }),
    )
    .min(3),
});

interface TableRead {
  rows: [Row, Row, Row];
  /** The reader's line per digit on what each column stands for. */
  columns: string;
  reasons: string[];
}

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
  extra?: string,
): Promise<[Row, Row, Row]> {
  return (await readTableFull(input, model, effort, extra)).rows;
}

async function readTableFull(
  input: GuessInput,
  model: string,
  effort: Effort,
  extra?: string,
): Promise<TableRead> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: `decrypto:master:${input.purpose}`,
      modelOverride: model,
      system: tableSystem(input.purpose),
      user: extra ? `${guessUser(input)}\n\n${extra}` : guessUser(input),
      schemaName: "decrypto_table",
      jsonSchema: TABLE_JSON_SCHEMA,
      budgetMs: GUESS_MS,
      reasoningEffort: effort,
    }),
  );
  const parsed = RawTable.parse(raw);
  const rows = parsed.rows.slice(0, 3);
  return {
    rows: rows.map((r) => normalizeRow(r.pct)) as [Row, Row, Row],
    columns: parsed.columns,
    reasons: rows.map((r) => r.reasoning ?? ""),
  };
}

export async function mastermindGuess(input: GuessInput): Promise<Code> {
  return (await mastermindGuessNoted(input)).code;
}

/** Mastermind's guess with its working — the debrief's note. */
export function mastermindGuessNoted(input: GuessInput): Promise<NotedCode> {
  // A guess inside a search (a play-out) keeps the search's place in the queue.
  const own = searchStart.getStore();
  return own === undefined ? searchStart.run(Date.now(), () => guess(input)) : guess(input);
}

// ── Interception variants (bench only, like the encrypt variants) ─────────
//
// "khyp": before reading the clues, infer each column's likely hidden keyword
// from the public table — interception then reads like decoding against the
// suspected keywords. "ens5": five tables instead of three.

const HYP_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    columns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          digit: { type: "integer", enum: [1, 2, 3, 4] },
          words: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { word: { type: "string" }, pct: { type: "integer" } },
              required: ["word", "pct"],
            },
            description: "Your five likeliest hidden keywords for this column, best first.",
          },
        },
        required: ["digit", "words"],
      },
    },
  },
  required: ["columns"],
};

const RawHyp = z.object({
  columns: z.array(
    z.object({
      digit: z.number().int(),
      words: z.array(z.object({ word: z.string(), pct: z.number() })),
    }),
  ),
});

const HYP_SYSTEM = `You are an expert Decrypto player studying a rival team's public clue table. Every
column (digit 1-4) hides one secret keyword — a common, concrete noun. Each clue evokes
that keyword's meaning from some angle; skilled encryptors switch angles every round.
For each column, name your five likeliest hidden keywords with honest percentages
(they need not sum to 100 — the rest is "something else"). A column with no clues: say
so with low percentages. Single words.`;

/** The suspected keywords behind each public column, as a block for the table readers. */
async function keywordHypotheses(input: GuessInput): Promise<string | null> {
  if (input.purpose !== "intercept" || input.targetRevealedClues.length === 0) return null;
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: "decrypto:master:hypotheses",
      modelOverride: smartModel(),
      system: HYP_SYSTEM,
      user: `THE RIVAL'S PUBLIC CLUE TABLE:\n${digitTable(input.targetRevealedClues)}`,
      schemaName: "decrypto_hypotheses",
      jsonSchema: HYP_JSON_SCHEMA,
      budgetMs: 20_000,
      reasoningEffort: "medium",
    }),
  );
  const cols = RawHyp.parse(raw).columns;
  const lines = [1, 2, 3, 4].map((d) => {
    const words = cols.find((c) => c.digit === d)?.words ?? [];
    return `  #${d}: ${words.length ? words.map((w) => `${w.word} ${Math.round(w.pct)}%`).join(", ") : "(no idea)"}`;
  });
  return `LIKELY HIDDEN KEYWORDS PER COLUMN (an analyst's read of the table — use them like a
decoder would use real keywords, but remember they are guesses):\n${lines.join("\n")}`;
}

/** One careful assignment-style guess (the one-call tiers' prompt) on the smart model. */
async function oneCallGuess(input: GuessInput, effort: Effort): Promise<number[]> {
  return (await oneCallGuessFull(input, effort)).code;
}

async function oneCallGuessFull(
  input: GuessInput,
  effort: Effort,
): Promise<{ code: number[]; reasons: string[] }> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: `decrypto:master:${input.purpose}-one`,
      modelOverride: smartModel(),
      system: input.purpose === "decode" ? decodeSystem() : interceptSystem(),
      user: guessUser(input),
      schemaName: "decrypto_guess",
      jsonSchema: GUESS_JSON_SCHEMA,
      budgetMs: GUESS_MS,
      reasoningEffort: effort,
    }),
  );
  const parsed = RawGuessSchema.parse(raw);
  const code = [...parsed.code];
  return {
    code: new Set(code).size === 3 ? code : parsed.assignments.map((a) => a.digit),
    reasons: parsed.assignments.map((a) => a.reasoning),
  };
}

const ADJUDICATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    review: {
      type: "string",
      description: "For each candidate code, test every clue against its column; note what breaks.",
    },
    code: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "integer", enum: [1, 2, 3, 4] },
    },
    reasons: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      description:
        "After answering, for the debrief: one short sentence per clue, in clue order, on why it is that digit.",
      items: { type: "string" },
    },
  },
  required: ["review", "code", "reasons"],
};

const RawAdjudicate = z.object({
  review: z.string(),
  code: z.array(z.number().int()).min(3),
  reasons: z.array(z.string()).optional(),
});

interface Verdict {
  code: number[];
  review: string;
  reasons: string[];
}

/** Several methods propose codes; one strong reader weighs the candidates against each other. */
async function adjudicate(input: GuessInput, candidates: string[]): Promise<Verdict> {
  const raw = await withSlot(() =>
    structuredGenerate({
      feature: "decrypto",
      label: `decrypto:master:${input.purpose}-adjudicate`,
      modelOverride: smartModel(),
      system: `${input.purpose === "decode" ? decodeSystem() : interceptSystem()}

THIS TASK: several analysts proposed codes for these clues. Check each candidate clue by
clue against the table — which assignments are forced, which are stretched — and answer
with the single most likely code (it may be one none of them proposed).`,
      user: `${guessUser(input)}\n\nCANDIDATE CODES: ${candidates.join(", ")}`,
      schemaName: "decrypto_adjudicate",
      jsonSchema: ADJUDICATE_JSON_SCHEMA,
      budgetMs: GUESS_MS,
      reasoningEffort: "high",
    }),
  );
  const parsed = RawAdjudicate.parse(raw);
  return { code: parsed.code.slice(0, 3), review: parsed.review, reasons: parsed.reasons ?? [] };
}

function plurality(codes: number[][]): number[] {
  const count = new Map<string, number>();
  for (const c of codes) count.set(c.join(""), (count.get(c.join("")) ?? 0) + 1);
  let best = codes[0] ?? [1, 2, 3];
  let n = 0;
  for (const c of codes) {
    const k = count.get(c.join("")) ?? 0;
    if (k > n) {
      n = k;
      best = c;
    }
  }
  return best;
}

function validOr(code: number[], fallback: () => Promise<Code>): Code | Promise<Code> {
  return code.length === 3 && new Set(code).size === 3 && code.every((d) => d >= 1 && d <= 4)
    ? ([...code] as unknown as Code)
    : fallback();
}

function guessFlags(model: string): Set<string> {
  if (process.env.DECRYPTO_BENCH_VARIANTS !== "1" || !model.includes(":")) return new Set();
  return new Set(model.slice(model.indexOf(":") + 1).split("+"));
}

/** A table reader's "one line per digit" → four column lines (null when it didn't keep the shape). */
export function columnLines(raw: string): (string | null)[] | null {
  const lines = raw
    .split(/\n|;\s*(?=[1-4]\s*[:=.)-])/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: (string | null)[] = [null, null, null, null];
  for (const line of lines) {
    const m = /^(?:digit\s*)?([1-4])\s*[:=.)\-–—]+\s*(.+)$/i.exec(line);
    if (m?.[1] && m[2]) out[Number(m[1]) - 1] = noteText(m[2]);
  }
  if (out.some((x) => x !== null)) return out;
  return lines.length === 4 ? lines.map((l) => noteText(l)) : null;
}

/** A guess's working → its note. */
export function guessNote(
  input: GuessInput,
  code: readonly number[],
  parts: {
    why?: readonly (string | undefined)[];
    rows?: readonly Row[] | null;
    columns?: string | null;
    candidates?: { code: number[]; from: GuessNote["candidates"][number]["from"] }[];
    verdict?: string | null;
  },
): GuessNote {
  const seen = new Set<string>();
  const candidates: GuessNote["candidates"] = [];
  for (const c of parts.candidates ?? []) {
    const key = c.code.join("");
    if (seen.has(key) || c.code.length !== 3 || new Set(c.code).size !== 3) continue;
    if (!c.code.every((d) => d >= 1 && d <= 4)) continue;
    seen.add(key);
    candidates.push({ code: c.code.slice(0, 3) as [number, number, number], from: c.from });
  }
  return {
    purpose: input.purpose,
    picks: code.slice(0, 3).map((digit, i) => ({
      digit,
      why: noteText(parts.why?.[i]),
      chances: parts.rows?.[i] ? parts.rows[i].map(clamp01) : null,
    })),
    columns: parts.columns ? columnLines(parts.columns) : null,
    candidates: candidates.slice(0, 8),
    verdict: noteText(parts.verdict ?? null),
    standIn: false,
    cost: null,
    traceIds: [],
  };
}

async function guess(input: GuessInput): Promise<NotedCode> {
  const flags = guessFlags(input.model);
  const plain = async (code: Code | Promise<Code>): Promise<NotedCode> => {
    const c = await code;
    return { code: c, note: guessNote(input, c, {}) };
  };
  if (flags.has("ana1") || flags.has("high")) {
    const code = await oneCallGuess(input, flags.has("high") ? "high" : "medium");
    return plain(validOr(code, () => tableGuess(input, flags)));
  }
  if (flags.has("ana3")) {
    const codes = await settledBy(
      [0, 1, 2].map(() => oneCallGuess(input, "medium")),
      GUESS_MS,
    );
    if (codes.length === 0) return plain(tableGuess(input, flags));
    return plain(validOr(plurality(codes), () => tableGuess(input, flags)));
  }
  if (flags.has("tables")) return plain(tableGuess(input, flags));
  // The default since 2026-11-23: candidates from several methods, then one
  // strong call weighs them (interception bench 70% exact vs 61% for the
  // averaged tables; whole games 67% vs 58% of intercepts).
  const started = Date.now();
  const [tables, ones] = await Promise.all([
    settledBy(
      tableModels().map(({ model, effort }) => readTableFull(input, model, effort)),
      CANDIDATE_MS,
    ),
    settledBy([oneCallGuessFull(input, "medium"), oneCallGuessFull(input, "medium")], CANDIDATE_MS),
  ]);
  const averaged =
    tables.length > 0
      ? ([0, 1, 2].map((i) => meanRow(tables.map((t) => t.rows[i] as Row))) as [Row, Row, Row])
      : null;
  const proposed: { code: number[]; from: GuessNote["candidates"][number]["from"] }[] = [];
  for (const t of tables) proposed.push({ code: [...likeliestCode(t.rows)], from: "table" });
  if (averaged) proposed.push({ code: [...likeliestCode(averaged)], from: "average" });
  for (const o of ones) proposed.push({ code: o.code, from: "one-call" });
  const columns = tables[0]?.columns ?? null;
  /** The reasons of whichever method proposed `code`, if one did. */
  const whyFor = (code: readonly number[]): string[] | undefined => {
    const one = ones.find((o) => o.code.join("") === code.join(""));
    if (one) return one.reasons;
    return tables.find((t) => likeliestCode(t.rows).join("") === code.join(""))?.reasons;
  };
  const noted = (code: Code, extra: { why?: string[]; verdict?: string } = {}): NotedCode => ({
    code,
    note: guessNote(input, code, {
      why: extra.why ?? whyFor(code),
      rows: averaged,
      columns,
      candidates: proposed,
      verdict: extra.verdict ?? null,
    }),
  });
  const distinct = new Set(proposed.map((p) => p.code.join("-")));
  if (distinct.size === 1) {
    const only = proposed[0]?.code ?? [];
    return noted(await validOr(only, () => tableGuess(input, flags)));
  }
  const judged = await settledBy(
    [adjudicate(input, [...distinct])],
    Math.max(0, GUESS_TOTAL_MS - (Date.now() - started)),
  );
  const verdict = judged[0];
  if (verdict) {
    const code = await validOr(verdict.code, () => tableGuess(input, flags));
    const why = verdict.reasons.length >= 3 ? verdict.reasons : whyFor(code);
    return noted(code, { why, verdict: verdict.review });
  }
  // No verdict in time: the averaged tables' code (the old default).
  if (averaged) return noted(likeliestCode(averaged));
  const first = ones[0];
  if (first) return noted(await validOr(first.code, () => tableGuess(input, flags)));
  throw new Error("no candidate code arrived in time");
}

async function tableGuess(input: GuessInput, flags: Set<string>): Promise<Code> {
  const hyp = flags.has("khyp")
    ? await settledBy([keywordHypotheses(input)], 22_000).then((r) => r[0] ?? null)
    : null;
  const models = flags.has("ens5")
    ? [
        ...tableModels(),
        { model: smartModel(), effort: "medium" as Effort },
        { model: balancedModel(), effort: "low" as Effort },
      ]
    : tableModels();
  const tables = await settledBy(
    models.map(({ model, effort }) => readTable(input, model, effort, hyp ?? undefined)),
    GUESS_MS,
  );
  if (tables.length === 0) throw new Error("no probability table arrived in time");
  const rows = [0, 1, 2].map((i) => meanRow(tables.map((t) => t[i] as Row))) as [Row, Row, Row];
  return likeliestCode(rows);
}
