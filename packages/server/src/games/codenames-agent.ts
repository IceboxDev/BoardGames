import type {
  AiSpend,
  ClueInput,
  ClueOutput,
  CodenamesAiAgent,
  GuessInput,
  GuessOutput,
  PublicTurn,
  SpymasterTurn,
} from "@boardgames/core/games/codenames/ai/agent";
import { fallbackClue, fallbackGuess } from "@boardgames/core/games/codenames/ai/fallback";
import {
  type CodenamesAiModel,
  codenamesModelOf,
} from "@boardgames/core/games/codenames/ai/models";
import {
  clueSituation,
  guessSituation,
  pendingTargets,
  readScore,
  unfinishedClues,
} from "@boardgames/core/games/codenames/ai/situation";
import {
  type Clue,
  type ClueCount,
  clueProblem,
  foldWord,
  formatClueCount,
  MAX_CLUE_COUNT,
} from "@boardgames/core/games/codenames/clue-rules";
import { z } from "zod";
import { causeChain, type StructuredGenerateArgs, structuredGenerateTraced } from "../lib/ai";

/**
 * LLM-backed Codenames / Duet agent, bound per session while AI is available
 * (`games/registry.ts`); otherwise the core fallback plays. Every entry point
 * catches, re-prompts once on a rules violation, and falls back — and the
 * machine's own deadline race + sanitizer sits above this, so nothing here
 * can wedge a session.
 *
 * Strategy: the prompts carry a playbook (the +1 guess, leftovers, ∞ and 0
 * clues, the endgame race, reading the other side's misses) plus the
 * position's own read from `core/.../ai/situation.ts`. The Mastermind tier
 * also test-reads its candidate clues with a keyless operative model and
 * keeps the one that reads best.
 *
 * Every answer carries its reasoning — the end-of-game review shows what each
 * clue was aimed at and why each card was touched.
 *
 * REDACTION: the operative prompt is built from `GuessInput`, which has no key
 * at all — only the face-down words, the clue and the public history.
 */

/** The whole clue step must finish inside the machine's 60 s deadline. */
const CLUE_STEP_MS = 84_000;
/** The thoughtful (Mastermind: medium-effort) clue call's hard limit, retries included… */
const CLUE_BUDGET_MS = 58_000;
/** …and, when it misses it, a quick low-effort call in the time left. */
const QUICK_CLUE_MS = 20_000;
const GUESS_BUDGET_MS = 30_000;
const READ_BUDGET_MS = 14_000;
/** Don't start a test read with less than this left of the clue step. */
const MIN_READ_MS = 6_000;

const TIER_MODELS: Record<CodenamesAiModel, { env: string; fallback: string }> = {
  "codenames-medium": { env: "CODENAMES_MODEL_MEDIUM", fallback: "openai/gpt-5-nano" },
  "codenames-hard": { env: "CODENAMES_MODEL_HARD", fallback: "openai/gpt-5.4-nano" },
  "codenames-expert": { env: "CODENAMES_MODEL_EXPERT", fallback: "openai/gpt-5.2" },
};

/** The keyless reader the Mastermind checks its clues against. */
const READER_TIER: CodenamesAiModel = "codenames-hard";

function modelForTier(tier: string): string {
  const entry = TIER_MODELS[codenamesModelOf(tier)];
  return process.env[entry.env]?.trim() || entry.fallback;
}

type Effort = "low" | "medium" | "high";

const asEffort = (value: string | undefined): Effort | null =>
  value === "low" || value === "medium" || value === "high" ? value : null;

/** Guessing effort (all tiers). */
function reasoningEffort(): Effort {
  return asEffort(process.env.CODENAMES_REASONING_EFFORT) ?? "low";
}

/**
 * The spymaster's effort: the Mastermind thinks harder, since it must find a
 * real link for every idea size (4/3/2/1) in one answer. Env overrides.
 */
function clueEffort(tier: CodenamesAiModel): Effort {
  return (
    asEffort(process.env.CODENAMES_CLUE_REASONING_EFFORT) ??
    (tier === "codenames-expert" ? "medium" : reasoningEffort())
  );
}

/** One idea per size, largest first: 4, 3, 2, 1 — never more than the agents left. */
export function ideaSizes(agentsLeft: number): number[] {
  return [4, 3, 2, 1].filter((n) => n <= Math.max(1, agentsLeft));
}

/** How bold each tier's spymaster is told to be. */
const AMBITION: Record<CodenamesAiModel, string> = {
  "codenames-medium": "Play it safe: link one or two words you are sure of.",
  "codenames-hard": "Aim for two or three words when the link is clear; never risk the assassin.",
  "codenames-expert":
    "Aim for the strongest clue: three or more words when a precise link exists, but a clue that leads to the assassin or the opponent loses games.",
};

const LANGUAGE_NAME = { en: "English", de: "German" } as const;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const RESULT_WORD: Record<PublicTurn["guesses"][number]["result"], string> = {
  own: "ours",
  opponent: "theirs",
  bystander: "bystander",
  assassin: "ASSASSIN",
};

function historyText(history: readonly SpymasterTurn[]): string {
  if (history.length === 0) return "(no clues yet)";
  return history
    .map((t, i) => {
      const clue = t.clue ? `${t.clue.word.toUpperCase()} ${formatClueCount(t.clue.count)}` : "—";
      const meant = t.intended?.length
        ? ` [you meant: ${t.intended.map((w) => w.toUpperCase()).join(", ")}]`
        : "";
      const guesses = t.guesses
        .map((g) => `${g.word.toUpperCase()}→${RESULT_WORD[g.result]}`)
        .join(", ");
      return `${i + 1}. ${t.by === "us" ? "Us" : "Them"}: ${clue}${meant}${guesses ? ` — touched ${guesses}` : " — nothing touched"}`;
    })
    .join("\n");
}

const SPYMASTER_PLAYBOOK = `PLAYBOOK
- Your number buys number + 1 guesses. The +1 is for a leftover from one of your earlier clues.
- Count honestly: the number is how many of YOUR face-down cards the clue points to.
- One leftover from an earlier clue is covered by the +1 — don't spend a whole clue on it; clue new words instead.
- Two or more leftovers your operatives can place: ∞ (unlimited) with a clue for new words lets them collect everything.
- 0 is legal and rare: "none of ours relate to WORD" — useful only to steer operatives away from a dangerous meaning (and it allows unlimited guesses).
- The race matters more than safety near the end: if the other team is about to win, a cautious clue loses — link every remaining agent you can. When you are well ahead, take no risks.
- Picture a smart operative reading your clue: list the face-down words they would pick first. Your targets must rank above every bystander, opponent agent and above all the assassin.
- Avoid clues whose most obvious meaning is a word you must avoid, and clue words that are rare or ambiguous in the board's language.`;

const DUET_PLAYBOOK = `PLAYBOOK
- Your partner may keep guessing while they hit agents; a bystander ends the turn and costs a timer turn.
- The number is information for your partner, not a limit. Count honestly.
- A leftover from your earlier clue can be taken on a later turn — don't spend a whole clue on a single leftover when new words can be linked.
- Few turns left and many agents hidden: be ambitious.
- Picture your partner reading the clue: your targets must rank above every bystander and above all the assassins.`;

function clueSystem(input: ClueInput): string {
  const lang = LANGUAGE_NAME[input.language];
  const game =
    input.mode === "duet"
      ? "You are a spymaster in Codenames: Duet, a two-player co-op game. Your partner guesses the agents on YOUR side of the key. A bystander ends the turn; an assassin loses the game for both of you."
      : "You are a spymaster in Codenames. Your operatives must find your team's agents. A bystander or an opponent's agent ends their turn (an opponent's agent also helps the other team); the assassin loses the game.";
  return [
    game,
    `Give ONE ${lang} word and a number.`,
    "Rules: one single word (no spaces, no digits); it must not be, contain, or be part of any face-down word on the table, and must not be a form of one (plural, verb form). Covered cards no longer matter. Clues must be about meaning, not spelling or letter count.",
    input.mode === "duet" ? DUET_PLAYBOOK : SPYMASTER_PLAYBOOK,
    AMBITION[input.model],
    [
      `Give exactly ${ideaSizes(input.agentsLeft).length} candidates, one for each size: ${ideaSizes(input.agentsLeft).join(", ")} words. Each must genuinely try to link that many of YOUR face-down words (its targets are exactly that many) — attempt every size, even when the link is a stretch, and note its risk honestly. Then pick the one you would give by its index in \`choice\`.`,
      "For each candidate: its `targets` are ONLY the face-down words this clue itself points to — each with `why`, a few words on how that word connects to the clue (shown to the players after the game). The number you give is the count of these targets.",
      "Leftovers from your earlier clues do NOT belong in `targets`: list the ones you expect your operatives to take with the extra guess in `leftovers`. Never stretch a new clue to cover a leftover.",
      "`summary`: one plain sentence about the idea that links the targets (and, if it matters, the dangerous card you kept away from). Never mention other candidates, tests, or your thinking process.",
    ].join(" "),
  ].join("\n\n");
}

function clueUser(input: ClueInput, violation?: string): string {
  const live = input.cards.filter((c) => !c.revealed);
  const group = (kind: string) =>
    live
      .filter((c) => c.kind === kind)
      .map((c) => c.word.toUpperCase())
      .join(", ") || "(none)";
  const sections = [
    `YOUR AGENTS (targets): ${group("own")}`,
    input.mode === "classic" ? `OPPONENT'S AGENTS (avoid): ${group("opponent")}` : null,
    `BYSTANDERS (avoid): ${group("bystander")}`,
    `ASSASSIN${input.mode === "duet" ? "S" : ""} (never): ${group("assassin")}`,
    `SITUATION:\n${clueSituation(input)
      .map((l) => `- ${l}`)
      .join("\n")}`,
    `CLUES SO FAR:\n${historyText(input.history)}`,
    violation ? `YOUR LAST CLUE WAS REJECTED: ${violation} Give a different word.` : null,
  ];
  return sections.filter((s) => s !== null).join("\n\n");
}

const OPERATIVE_PLAYBOOK = `PLAYBOOK
- Rank the face-down words by how strongly the clue points to them, from a typical player's point of view.
- Take at most as many words for the current clue as its number — your spymaster counted them. The extra (+1) guess is only for a word left over from one of YOUR EARLIER clues (name that clue in \`for\`); never spend it on another word for the current clue.
- Words the other team's clue pointed at but that they didn't find are probably theirs — avoid them.
- A miss ends the turn (and may help the other team); the assassin loses the game. When unsure, stop — unless the game is about to be lost anyway.`;

function guessSystem(input: GuessInput, reader = false): string {
  const lang = LANGUAGE_NAME[input.language];
  return [
    input.mode === "duet"
      ? "You are guessing in Codenames: Duet. Your partner gave a clue pointing at agents on their key. A bystander ends the turn; an assassin loses the game."
      : "You are an operative in Codenames. Your spymaster gave a clue pointing at your team's agents.",
    `The words are ${lang}.`,
    OPERATIVE_PLAYBOOK,
    reader
      ? "List the face-down words in the order you would touch them for this clue, as many as the number allows plus one. Confidence 0–1 each."
      : "List only picks you would actually touch, most confident first, each with a confidence (0–1) and a few words on why — they are shown to the players after the game. In `reasoning`, say how you read the clue in one sentence.",
  ].join("\n\n");
}

function guessUser(input: GuessInput): string {
  const limit = input.guessesLeft === null ? "as many as you like" : String(input.guessesLeft);
  return [
    `CLUE: ${input.clue.word.toUpperCase()} ${formatClueCount(input.clue.count)}`,
    `Guesses allowed: ${limit}`,
    `FACE-DOWN WORDS: ${input.words.map((w) => w.word.toUpperCase()).join(", ")}`,
    `SITUATION:\n${guessSituation(input)
      .lines.map((l) => `- ${l}`)
      .join("\n")}`,
    `CLUES SO FAR:\n${historyText(input.history)}`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CLUE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          clue: { type: "string", description: "One word." },
          unlimited: {
            type: "boolean",
            description: "true to say ∞ (unlimited) instead of the number of targets.",
          },
          targets: {
            type: "array",
            maxItems: MAX_CLUE_COUNT,
            description: "Only the face-down words THIS clue points to.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                word: { type: "string" },
                why: { type: "string", description: "A few words: how it connects to the clue." },
              },
              required: ["word", "why"],
            },
          },
          leftovers: {
            type: "array",
            description: "Earlier clues' unfound words meant for the extra guess (not targets).",
            items: { type: "string" },
          },
          risk: {
            type: "string",
            description: "The non-target card an operative is most likely to pick, and why.",
          },
          summary: {
            type: "string",
            description: "One sentence on the idea linking the targets. No process talk.",
          },
        },
        required: ["clue", "unlimited", "targets", "leftovers", "risk", "summary"],
      },
    },
    choice: { type: "integer", minimum: 0, maximum: 3, description: "Index of the clue to give." },
  },
  required: ["candidates", "choice"],
};

const RawCandidateSchema = z.object({
  clue: z.string(),
  unlimited: z.boolean(),
  targets: z.array(z.object({ word: z.string(), why: z.string() })),
  leftovers: z.array(z.string()),
  risk: z.string(),
  summary: z.string(),
});
type RawCandidate = z.infer<typeof RawCandidateSchema>;

const RawClueSchema = z.object({
  candidates: z.array(RawCandidateSchema).min(1),
  choice: z.number().int(),
});
type RawClue = z.infer<typeof RawClueSchema>;

const GUESS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasoning: { type: "string", description: "One sentence: how you read the clue." },
    picks: {
      type: "array",
      maxItems: 10,
      description: "Words to touch, most confident first.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          word: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          why: { type: "string", description: "A few words: how it connects to the clue." },
          for: {
            type: "string",
            description:
              "The clue this word answers: the current clue's word, or an earlier clue of yours it was left over from.",
          },
        },
        required: ["word", "confidence", "why", "for"],
      },
    },
  },
  required: ["reasoning", "picks"],
};

const RawPickSchema = z.object({
  word: z.string(),
  confidence: z.number(),
  why: z.string(),
  for: z.string(),
});
type RawPick = z.infer<typeof RawPickSchema>;

const RawGuessSchema = z.object({
  reasoning: z.string(),
  picks: z.array(RawPickSchema),
});

/**
 * The clue's number is a promise: at most that many picks for the clue
 * itself. Anything past it must be a word owed by an earlier clue of ours
 * (what the +1 guess is for) — a third DAIRY word after DAIRY 1 is dropped.
 * ∞ has no cap; 0 allows leftovers only.
 */
export function capPicks(picks: readonly RawPick[], input: GuessInput): RawPick[] {
  const limit = input.clue.count === "unlimited" ? null : input.clue.count;
  if (limit === null) return [...picks];
  const owed = unfinishedClues(input).map((c) => ({ word: foldWord(c.word), missing: c.missing }));
  let forThisClue = 0;
  return picks.filter((pick) => {
    const earlier = owed.find((c) => c.word === foldWord(pick.for) && c.missing > 0);
    if (earlier) {
      earlier.missing--;
      return true;
    }
    if (forThisClue < limit) {
      forThisClue++;
      return true;
    }
    return false;
  });
}

/** Picks below this stop the turn (the first pick is always kept). */
const CONFIDENCE_FLOOR: Record<CodenamesAiModel, number> = {
  "codenames-medium": 0.7,
  "codenames-hard": 0.6,
  "codenames-expert": 0.5,
};

/** With the game about to be lost, a long shot beats stopping. */
const DESPERATE_FLOOR = 0.2;

// ---------------------------------------------------------------------------
// Spend: every model call an answer took, for the game's notes
// ---------------------------------------------------------------------------

class Spend {
  calls = 0;
  usd = 0;
  readonly traceIds: string[] = [];

  async call(args: StructuredGenerateArgs): Promise<unknown> {
    const { output, call } = await structuredGenerateTraced(args).catch((err: unknown) => {
      this.calls++;
      throw err;
    });
    this.calls++;
    this.usd += call.usage.costUsd ?? 0;
    this.traceIds.push(call.id);
    return output;
  }

  /** The spend fields of an agent answer. */
  get fields(): AiSpend {
    return { cost: { calls: this.calls, usd: this.usd }, traceIds: [...this.traceIds] };
  }
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

function indexOfWord(
  cards: readonly { index: number; word: string }[],
  word: string,
): number | null {
  const folded = foldWord(word);
  return cards.find((c) => foldWord(c.word) === folded)?.index ?? null;
}

function indicesOf(cards: readonly { index: number; word: string }[], words: readonly string[]) {
  const out: number[] = [];
  for (const w of words) {
    const i = indexOfWord(cards, w);
    if (i !== null && !out.includes(i)) out.push(i);
  }
  return out;
}

/** `run`, or a rejection once `ms` have passed (the call itself is left to finish). */
function withDeadline<T>(run: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took over ${ms} ms`)), ms);
    run.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function callClue(
  spend: Spend,
  input: ClueInput,
  violation?: string,
  quick = false,
): Promise<RawClue> {
  const budgetMs = quick ? QUICK_CLUE_MS : CLUE_BUDGET_MS;
  const call = spend.call({
    feature: "codenames",
    label: "codenames-clue",
    modelOverride: modelForTier(input.model),
    system: clueSystem(input),
    user: clueUser(input, violation),
    schemaName: "codenames_clue",
    jsonSchema: CLUE_JSON_SCHEMA,
    budgetMs,
    reasoningEffort: quick ? "low" : clueEffort(input.model),
  });
  // Transient-error retries live below; this bounds them all together.
  return RawClueSchema.parse(await withDeadline(call, budgetMs, "the clue call"));
}

/** A candidate clue as the agent plays it. */
interface Candidate {
  clue: Clue;
  targets: number[];
  links: { card: number; why: string }[];
  leftover: number[];
  summary: string;
}

/**
 * A model candidate → a playable clue. Enforces the leftover rule: a word
 * still owed from an earlier clue is the extra guess's job, not the new
 * clue's — so it moves to `leftover` and the number drops (one leftover:
 * the +1 covers it; two or more: ∞, so the team can collect them all).
 */
export function toCandidate(raw: RawCandidate, input: ClueInput): Candidate | null {
  const faceDown = input.cards.filter((c) => !c.revealed);
  const own = new Set(faceDown.filter((c) => c.kind === "own").map((c) => c.index));
  const pending = new Set(
    indicesOf(
      faceDown,
      pendingTargets(input).flatMap((p) => p.words),
    ),
  );
  const named = raw.targets.flatMap((t) => {
    const card = indexOfWord(faceDown, t.word);
    return card === null ? [] : [{ card, why: t.why.trim() }];
  });
  const fresh = named.filter((t) => !pending.has(t.card));
  const moved = fresh.length > 0 ? named.filter((t) => pending.has(t.card)) : [];
  const targets = (moved.length > 0 ? fresh : named).filter(
    (t, i, all) => all.findIndex((x) => x.card === t.card) === i,
  );
  const leftover = [
    ...moved.map((t) => t.card),
    ...indicesOf(faceDown, raw.leftovers).filter((c) => own.has(c)),
  ].filter((c, i, all) => all.indexOf(c) === i && !targets.some((t) => t.card === c));
  const unlimited =
    input.mode === "classic" && (raw.unlimited || (moved.length >= 2 && targets.length > 0));
  const count: ClueCount = unlimited ? "unlimited" : Math.min(MAX_CLUE_COUNT, targets.length);
  if (!raw.clue.trim()) return null;
  return {
    clue: { word: raw.clue.trim(), count },
    targets: targets.map((t) => t.card),
    links: targets.filter((t) => t.why).map((t) => ({ card: t.card, why: t.why })),
    leftover,
    summary: raw.summary.trim(),
  };
}

/** The order a keyless operative would touch the table for `clue`. */
async function testRead(
  spend: Spend,
  input: ClueInput,
  clue: Clue,
  budgetMs: number,
): Promise<number[]> {
  const words = input.cards
    .filter((c) => !c.revealed)
    .map((c) => ({ index: c.index, word: c.word }));
  const readerInput: GuessInput = {
    model: READER_TIER,
    mode: input.mode,
    language: input.language,
    words,
    clue,
    guessesLeft: typeof clue.count === "number" && clue.count > 0 ? clue.count + 1 : null,
    agentsLeft: input.agentsLeft,
    ...(input.opponentAgentsLeft !== undefined
      ? { opponentAgentsLeft: input.opponentAgentsLeft }
      : {}),
    // The reader gets the public record only — never what was meant.
    history: input.history.map(({ intended: _secret, ...turn }) => turn),
  };
  const raw = await spend.call({
    feature: "codenames",
    label: "codenames-read",
    modelOverride: modelForTier(READER_TIER),
    system: guessSystem(readerInput, true),
    user: guessUser(readerInput),
    schemaName: "codenames_guess",
    jsonSchema: GUESS_JSON_SCHEMA,
    budgetMs,
    reasoningEffort: "low",
  });
  return indicesOf(
    words,
    RawGuessSchema.parse(raw).picks.map((p) => p.word),
  );
}

/**
 * Mastermind: read every idea (one per size) through a keyless operative and
 * keep the one whose reading lands best — +1 per own agent read in order,
 * the first miss priced by what it hits (`readScore`). A 3-word idea that
 * reads cleanly beats a safe single; one that reads a bystander first loses.
 */
async function bestByTestRead(
  spend: Spend,
  input: ClueInput,
  pool: Candidate[],
  startedAt: number,
): Promise<{ pick: Candidate; read: number[] | null }> {
  const [chosen] = pool;
  if (!chosen) throw new Error("no candidate");
  const left = CLUE_STEP_MS - (Date.now() - startedAt);
  if (left < MIN_READ_MS || pool.length === 1) return { pick: chosen, read: null };
  const budget = Math.min(READ_BUDGET_MS, left - 1_000);
  const reads = await Promise.all(
    pool.map((c) => testRead(spend, input, c.clue, budget).catch(() => null)),
  );
  const kindOf = (card: number) => input.cards.find((c) => c.index === card)?.kind;
  let best = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  pool.forEach((candidate, i) => {
    const read = reads[i];
    if (!read) return;
    // The chosen clue wins ties: the spymaster's own judgement counts too.
    const score = readScore(read, kindOf, candidate.clue.count) + (i === 0 ? 0.25 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return { pick: pool[best] ?? chosen, read: reads[best] ?? null };
}

async function giveClue(input: ClueInput): Promise<ClueOutput> {
  const startedAt = Date.now();
  const spend = new Spend();
  const faceUp = input.cards.filter((c) => !c.revealed).map((c) => c.word);
  const legal = (c: Candidate) => clueProblem(c.clue.word, faceUp, input.language) === null;
  const candidatesOf = (answer: RawClue) => {
    const all = answer.candidates.map((c) => toCandidate(c, input));
    const chosen = all[answer.choice] ?? all[0] ?? null;
    // The model's choice first, then the rest — all legal, all aimed at something.
    return [chosen, ...all.filter((c) => c !== chosen)].filter(
      (c): c is Candidate => c !== null && legal(c) && (c.targets.length > 0 || c.clue.count === 0),
    );
  };
  try {
    const first = await callClue(spend, input).catch((err: unknown) => {
      console.warn(`[codenames] slow or failed clue; asking quickly: ${causeChain(err)}`);
      return callClue(spend, input, undefined, true);
    });
    let pool = candidatesOf(first);
    if (pool.length === 0) {
      pool = candidatesOf(
        await callClue(spend, input, "none of your candidates was a legal clue for the table."),
      );
    }
    if (pool.length === 0) return { ...fallbackClue(input), ...spend.fields };

    const { pick, read } =
      input.model === "codenames-expert"
        ? await bestByTestRead(spend, input, pool.slice(0, 4), startedAt)
        : { pick: pool[0] as Candidate, read: null };
    return {
      ...pick.clue,
      targets: pick.targets,
      links: pick.links,
      leftover: pick.leftover,
      reasoning: pick.summary,
      considered: pool
        .filter((c) => c !== pick)
        .slice(0, 3)
        .map((c) => ({ word: c.clue.word, count: c.clue.count, targets: c.targets })),
      ...(read ? { testRead: read } : {}),
      ...spend.fields,
    };
  } catch (err) {
    console.error(`[codenames] clue failed; using fallback: ${causeChain(err)}`);
    return { ...fallbackClue(input), ...spend.fields };
  }
}

async function guess(input: GuessInput): Promise<GuessOutput> {
  const spend = new Spend();
  try {
    const raw = await spend.call({
      feature: "codenames",
      label: "codenames-guess",
      modelOverride: modelForTier(input.model),
      system: guessSystem(input),
      user: guessUser(input),
      schemaName: "codenames_guess",
      jsonSchema: GUESS_JSON_SCHEMA,
      budgetMs: GUESS_BUDGET_MS,
      reasoningEffort: reasoningEffort(),
    });
    const parsed = RawGuessSchema.parse(raw);
    const desperate = guessSituation(input).urgency === "desperate";
    const floor = desperate ? DESPERATE_FLOOR : CONFIDENCE_FLOOR[input.model];
    const picks: number[] = [];
    const notes: NonNullable<GuessOutput["notes"]> = [];
    for (const [i, pick] of capPicks(parsed.picks, input).entries()) {
      if (i > 0 && pick.confidence < floor) break;
      const index = indexOfWord(input.words, pick.word);
      if (index === null || picks.includes(index)) continue;
      picks.push(index);
      notes.push({ card: index, confidence: pick.confidence, why: pick.why });
    }
    if (picks.length === 0) return { ...fallbackGuess(input), ...spend.fields };
    return { picks, notes, reasoning: parsed.reasoning, ...spend.fields };
  } catch (err) {
    console.error(`[codenames] guess failed; using fallback: ${causeChain(err)}`);
    return { ...fallbackGuess(input), ...spend.fields };
  }
}

export const llmCodenamesAgent: CodenamesAiAgent = { giveClue, guess };
