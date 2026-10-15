import type {
  AiSpend,
  ClueInput,
  ClueOutput,
  CodenamesAiAgent,
  GuessInput,
  GuessOutput,
  JudgeInput,
  JudgeOutput,
  PublicTurn,
  SpymasterTurn,
} from "@boardgames/core/games/codenames/ai/agent";
import {
  fallbackClue,
  fallbackGuess,
  fallbackJudge,
} from "@boardgames/core/games/codenames/ai/fallback";
import {
  type CodenamesAiModel,
  codenamesModelOf,
} from "@boardgames/core/games/codenames/ai/models";
import {
  clueSituation,
  guessSituation,
  pendingTargets,
  type ReadPick,
  readScore,
  unfinishedClues,
} from "@boardgames/core/games/codenames/ai/situation";
import {
  type Clue,
  type ClueCount,
  clueProblem,
  clueVerdict,
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
/** A ruling on one clue question (the machine's own deadline is 20 s). */
const JUDGE_BUDGET_MS = 15_000;
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
 * The spymaster's effort. Low for every tier: medium was tried for the
 * Mastermind and in production ran 45–110 s a clue (vs ~20 s), tripping the
 * deadline into hurried or stand-in clues — better clues come from the
 * idea-per-size answer and the test reads, not from longer thinking. Env
 * overrides.
 */
function clueEffort(_tier: CodenamesAiModel): Effort {
  return asEffort(process.env.CODENAMES_CLUE_REASONING_EFFORT) ?? reasoningEffort();
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
    "Aim for the strongest clue: as many words as one precise link truly carries — three or more only when every one of them is obvious. A clue that leads to the assassin or the opponent loses games.",
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
    input.language === "de"
      ? "Spell German properly, with its umlauts and ß: SÄUGLING, not SAEUGLING; STRASSE only where it is spelled that way."
      : null,
    input.mode === "duet"
      ? "Rules: one single word (no spaces, no digits); it must not be, contain, or be part of any face-down word on the table, and must not be a form of one (plural, verb form). Covered cards no longer matter. Clues must be about meaning, not spelling or letter count."
      : "Rules: one single word (no spaces, no digits); it must not be a face-down word on the table or a form of one (plural, verb form). A word that only shares spelling with a face-down word (SPARROW while ROW is on the table, LAND while ENGLAND is) is given only if the other spymaster allows it — you will have to ask them, and they may refuse; prefer a clue that needs no permission when it is as good. Covered cards no longer matter. Clues must be about meaning, not spelling or letter count.",
    input.mode === "duet" ? DUET_PLAYBOOK : SPYMASTER_PLAYBOOK,
    AMBITION[input.model],
    [
      `Give up to ${ideaSizes(input.agentsLeft).length} candidates, one for each size: ${ideaSizes(input.agentsLeft).join(", ")} words. Each links that many of YOUR face-down words — skip a size that has no honest link; fewer, better candidates beat a stretch. Then pick the one you would give by its index in \`choice\`.`,
      "For each candidate: its `targets` are ONLY face-down words from YOUR AGENTS that this clue itself points to — never a bystander, an opponent's agent or the assassin (the card you fear they'll misread goes in `risk`). Each target has `why` (a few words on the link, shown to the players after the game) and `strength`: `obvious` (most players would name it within seconds of hearing the clue), `fair` (a good player gets it), or `stretch` (wordplay, a loose 'can be', a link you have to explain). Stretches are not given: a stretched target is dropped from the clue, and its number shrinks. The number you give is the count of these targets.",
      "Leftovers from your earlier clues do NOT belong in `targets`: list the ones you expect your operatives to take with the extra guess in `leftovers`. Never stretch a new clue to cover a leftover.",
      "`summary`: one plain sentence about the idea that links the targets (and, if it matters, the dangerous card you kept away from). Never mention other candidates, tests, or your thinking process.",
    ].join(" "),
  ]
    .filter((line) => line !== null)
    .join("\n\n");
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
                strength: {
                  type: "string",
                  enum: ["obvious", "fair", "stretch"],
                  description: "How readily a typical player connects it to the clue.",
                },
              },
              required: ["word", "why", "strength"],
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
  // Lenient: an unknown strength reads as `fair` rather than failing the whole answer.
  targets: z.array(
    z.object({ word: z.string(), why: z.string(), strength: z.string().optional() }),
  ),
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
 * A model candidate → a playable clue, or null when nothing it names is a
 * target. Only the team's own face-down agents can be targets: a bystander
 * or opponent the model listed (KITE for CYCLONE — the misread it feared) is
 * dropped, and so is a target it rated a `stretch`; the number counts what
 * remains. Enforces the leftover rule too: a word still owed from an earlier
 * clue is the extra guess's job, not the new clue's — so it moves to
 * `leftover` and the number drops (one leftover: the +1 covers it; two or
 * more: ∞, so the team can collect them all).
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
    return card === null || !own.has(card) || t.strength === "stretch"
      ? []
      : [{ card, why: t.why.trim() }];
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
  // Named targets, none of them playable: not a deliberate 0 clue.
  if (targets.length === 0 && raw.targets.length > 0 && !unlimited) return null;
  return {
    clue: { word: raw.clue.trim(), count },
    targets: targets.map((t) => t.card),
    links: targets.filter((t) => t.why).map((t) => ({ card: t.card, why: t.why })),
    leftover,
    summary: raw.summary.trim(),
  };
}

/** The order a keyless operative would touch the table for `clue`, and how sure it is of each. */
async function testRead(
  spend: Spend,
  input: ClueInput,
  clue: Clue,
  budgetMs: number,
): Promise<ReadPick[]> {
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
  const read: ReadPick[] = [];
  for (const pick of RawGuessSchema.parse(raw).picks) {
    const card = indexOfWord(words, pick.word);
    if (card !== null && !read.some((r) => r.card === card)) {
      read.push({ card, confidence: pick.confidence });
    }
  }
  return read;
}

/**
 * How much the spymaster's own pick counts against the reads: one more word
 * the reader is sure of outweighs it; a long shot doesn't.
 */
const OWN_CHOICE_BONUS = 0.3;

/**
 * Mastermind: read every idea (one per size) through a keyless operative and
 * keep the one whose reading lands best (`readScore`: own agents touched
 * while the reader is sure, the first miss priced by what it hits, each
 * target it didn't find held against the clue). A 3-word idea that reads
 * cleanly beats a safe single; a stretch the reader only half follows loses
 * to it, and the spymaster's own pick wins anything close.
 */
async function bestByTestRead(
  spend: Spend,
  input: ClueInput,
  pool: Candidate[],
  startedAt: number,
): Promise<{ pick: Candidate; read: ReadPick[] | null }> {
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
    const score =
      readScore(read, kindOf, candidate.clue.count, candidate.targets) +
      (i === 0 ? OWN_CHOICE_BONUS : 0);
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
  // Classic: a spelling-only clash is a legal thing to propose — the machine
  // asks the other spymaster, as it would for a person. Duet has no one to ask.
  const legal = (c: Candidate) =>
    input.mode === "classic"
      ? clueVerdict(c.clue.word, faceUp, input.language).kind !== "hard"
      : clueProblem(c.clue.word, faceUp, input.language) === null;
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
      ...(read ? { testRead: read.map((r) => r.card) } : {}),
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

// ---------------------------------------------------------------------------
// Ruling on the other side's clue question
// ---------------------------------------------------------------------------

const JUDGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    allow: { type: "boolean" },
    reason: {
      type: "string",
      description: "One short sentence, shown to both teams after the game.",
    },
  },
  required: ["allow", "reason"],
};

const RawJudgeSchema = z.object({ allow: z.boolean(), reason: z.string() });

function judgeSystem(input: JudgeInput): string {
  return [
    `You are the opposing spymaster in Codenames, playing in ${LANGUAGE_NAME[input.language]}. The other spymaster quietly asks whether a clue may stand although its spelling overlaps a word still face down on the table. You answer by the rulebook, fairly — not to win.`,
    `The rulebook (Codenames, CGE 2015, "Valid clues"): "Your clue must be about the meaning of the words. You can't use your clue to talk about the letters in a word … Gland is not a valid clue for ENGLAND." "You can't say any form of a visible word on the table. Until BREAK is covered up by a card, you can't say break, broken, breakage, or breakdown." "You can't say part of a compound word on the table. Until HORSESHOE is covered up, you can't say horse, shoe, unhorsed, or snowshoe." "Same-sounding words with different meanings and different spellings are considered different words … You can give the clue k-n-i-g-h-t even when NIGHT is one of the codenames on the table." "Words that are spelled the same are considered the same." But: "DON'T BE TOO STRICT. England and island were originally compound words, but in this century, island is a valid clue for ENGLAND. Even land is a valid clue for ENGLAND. And anybody who says you can't say sparrow when ROW is on the table is just trying to cause trouble."`,
    "Refuse when the clue is a form of the table word, a compound a speaker would hear as built from it, or a word whose only tie to the clue's meaning is its letters. Allow when the overlap is only spelling — the words mean unrelated things (KNIGHT and NIGHT, SPARROW and ROW) — or the compound is no longer felt as one.",
  ].join("\n\n");
}

async function judgeClue(input: JudgeInput): Promise<JudgeOutput> {
  const spend = new Spend();
  try {
    const raw = await spend.call({
      feature: "codenames",
      label: "codenames-judge",
      modelOverride: modelForTier(input.model),
      system: judgeSystem(input),
      user: `Clue: ${input.clue.toUpperCase()}\nFace-down word it overlaps: ${input.clash.toUpperCase()}`,
      schemaName: "codenames_judge",
      jsonSchema: JUDGE_JSON_SCHEMA,
      budgetMs: JUDGE_BUDGET_MS,
      reasoningEffort: "low",
    });
    const parsed = RawJudgeSchema.parse(raw);
    return { allow: parsed.allow, reason: parsed.reason, ...spend.fields };
  } catch (err) {
    console.error(`[codenames] ruling failed; using the stand-in judge: ${causeChain(err)}`);
    return { ...fallbackJudge(input), ...spend.fields };
  }
}

export const llmCodenamesAgent: CodenamesAiAgent = { giveClue, guess, judgeClue };
