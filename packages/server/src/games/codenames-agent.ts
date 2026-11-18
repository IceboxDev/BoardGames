import { readFileSync } from "node:fs";
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
  SpymasterCardKind,
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
  closesTheBoard,
  clueSituation,
  clueUrgency,
  guessSituation,
  pendingTargets,
  type ReadPick,
  readScore,
  unfinishedClues,
} from "@boardgames/core/games/codenames/ai/situation";
import {
  oddsOfListed,
  scoredTake,
  stopStateOf,
} from "@boardgames/core/games/codenames/ai/stop-rule";
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
import {
  type AiRole,
  causeChain,
  type StructuredGenerateArgs,
  structuredGenerateTraced,
  tierModel,
} from "../lib/ai";

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

/** The whole clue step must finish inside the machine's 90 s deadline. */
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
/** Once the main clue call is back, how long to still wait for the second brainstorm. */
const SECOND_GRACE_MS = 4_000;
/** The Mastermind test-reads at most this many ideas (both brainstorms pooled). */
const MAX_READ_IDEAS = 6;

/** Tier → the AI profile's role (lib/ai/models.ts); the env var pins one tier to a model. */
const TIER_MODELS: Record<CodenamesAiModel, { env: string; role: AiRole }> = {
  "codenames-medium": { env: "CODENAMES_MODEL_MEDIUM", role: "fast" },
  // The Analyst is the former Mastermind pipeline, on the smart role.
  "codenames-hard": { env: "CODENAMES_MODEL_HARD", role: "smart" },
  "codenames-expert": { env: "CODENAMES_MODEL_EXPERT", role: "smart" },
};

/** The keyless reader clues are checked against when a person will guess (balanced role)… */
const readerModel = () => tierModel("CODENAMES_MODEL_READER", "balanced");
/** …and a second, different reader, so a person's read is two opinions, not one model's habit. */
const secondReaderModel = () => tierModel("CODENAMES_MODEL_READER_2", "fast");
/** The extra brainstorms run on the balanced role: quicker, cheaper, and another model's ideas. */
const ideasModel = () => tierModel("CODENAMES_MODEL_IDEAS", "balanced");

/** The tiers that brainstorm in size slots and test-read their ideas (Analyst, Mastermind). */
const testsIdeas = (tier: CodenamesAiModel) => tier !== "codenames-medium";

/**
 * The Mastermind's parts, each switchable for the bench
 * (`scripts/codenames-bench.ts`): "0" turns one off, anything else (or unset)
 * leaves it on.
 */
function masterPart(
  name: "SLOTS" | "SECOND_CALL" | "MATCHED_READ" | "RAISE" | "TARGETED" | "FINISH",
): boolean {
  return process.env[`CODENAMES_MASTER_${name}`]?.trim() !== "0";
}

function modelForTier(tier: string): string {
  const entry = TIER_MODELS[codenamesModelOf(tier)];
  return tierModel(entry.env, entry.role);
}

type Effort = "low" | "medium" | "high";

const asEffort = (value: string | undefined): Effort | null =>
  value === "low" || value === "medium" || value === "high" ? value : null;

/** Guessing effort (all tiers). */
function reasoningEffort(): Effort {
  return asEffort(process.env.CODENAMES_REASONING_EFFORT) ?? "low";
}

/** An operative's guessing effort: `CODENAMES_GUESS_REASONING_EFFORT` pins it (the bench's switch). */
function guessEffort(): Effort {
  return asEffort(process.env.CODENAMES_GUESS_REASONING_EFFORT) ?? reasoningEffort();
}

/**
 * The spymaster's effort. The Mastermind thinks at medium: at low, Opus
 * (the Anthropic profile's smart model) barely thinks — on a replayed
 * production game (2026-11-15) it proposed only single-word ideas, padding
 * them with targets it rated stretches, so every clue was a 1. At medium the
 * same tables gave honest 2-word clues (MESSENGER: MERCURY, BAG) in 15–17 s
 * — well inside the 58 s clue cap. (Medium on the earlier OpenAI model ran
 * 45–110 s a clue; if the profile goes back to it, set
 * CODENAMES_CLUE_REASONING_EFFORT=low.) The other tiers stay at the guessing
 * effort. The env var overrides every tier.
 */
function clueEffort(tier: CodenamesAiModel): Effort {
  const pinned = asEffort(process.env.CODENAMES_CLUE_REASONING_EFFORT);
  if (pinned) return pinned;
  return testsIdeas(tier) ? "medium" : reasoningEffort();
}

/** One idea per size, largest first: 4, 3, 2, 1 — never more than the agents left. */
export function ideaSizes(agentsLeft: number): number[] {
  return [4, 3, 2, 1].filter((n) => n <= Math.max(1, agentsLeft));
}

/** How bold each tier's spymaster is told to be. */
const AMBITION: Record<CodenamesAiModel, string> = {
  "codenames-medium": "Play it safe: link one or two words you are sure of.",
  "codenames-hard":
    "Aim for the strongest clue: as many words as one precise link truly carries — three or more only when every one of them is obvious. A clue that leads to the assassin or the opponent loses games.",
  "codenames-expert":
    "Aim for the biggest clue the table will actually read: three or four words when one precise link carries them all, two only when nothing bigger reads cleanly. Every clue is tested on real guessers before it is given, so propose boldly — a clue that leads to the assassin or the opponent still loses games.",
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
- ∞ is your team's agreement and is set for you: a clue whose targets, together with the words still owed from your earlier clues, are ALL your remaining agents is given as ∞ ("everything is described — collect it all this turn"). Any other clue carries its number, which tells them an agent is still undescribed.
- 0 is legal and rare: "none of ours relate to WORD" — useful only to steer operatives away from a dangerous meaning (and it allows unlimited guesses).
- The race matters more than safety near the end: if the other team is about to win, a cautious clue loses — link every remaining agent you can. When you are well ahead, take no risks.
- Picture a smart operative reading your clue: list the face-down words they would pick first. Your targets must rank above every bystander, opponent agent and above all the assassin.
- Avoid clues whose most obvious meaning is a word you must avoid, and clue words that are rare or ambiguous in the board's language.`;

const DUET_PLAYBOOK = `PLAYBOOK
- Your partner may keep guessing while they hit agents; a bystander ends the turn and costs a timer turn.
- The number is information for your partner, not a limit. Count honestly.
- A leftover from your earlier clue can be taken on a later turn — don't spend a whole clue on a single leftover when new words can be linked.
- Few turns left and many agents hidden: be ambitious.
- ∞ is your agreement with your partner and is set for you: a clue whose targets, together with the words still owed from your earlier clues, are ALL the agents left on your side is given as ∞ ("everything is described — collect it all"). Any other clue carries its number, which tells them an agent is still undescribed.
- Picture your partner reading the clue: your targets must rank above every bystander and above all the assassins.`;

/** How a clue call asks: fixed per-size slots (the Mastermind) and the second brainstorm's lens. */
interface ClueStyle {
  slots: boolean;
  /** A wide brainstorm: up to `MANY_IDEAS` different ideas, as big as they truly go (the Mastermind's extras). */
  many?: boolean;
  /** An extra brainstorm's lens: the biggest honest group, or a fresh angle. */
  lens: "main" | "bold" | "fresh" | "phrase" | "category" | "big" | "plan";
}

const LIST_STYLE: ClueStyle = { slots: false, lens: "main" };

const LENS: Record<ClueStyle["lens"], string | null> = {
  main: null,
  bold: "Your lens: find the BIGGEST group of your agents that one precise word truly carries — that is what wins races. Never let a big clue lean towards the assassin.",
  plan: "Your lens: the WHOLE game. Split ALL of your remaining agents into the fewest clues — groups of three where you can, never leaving one agent alone (a lone agent costs a whole turn later). List the clue for each group of that plan, the strongest first.",
  big: "Your lens: the biggest groups — three or four of your agents under one precise word (a category, a phrase, a place, a shared property) that every operative would take with confidence.",
  phrase:
    "Your lens: compound words and set phrases — a word that completes or starts a phrase with each of your agents (FIRE: ___ TRUCK, ___ PLACE, CAMP___), idioms, titles of famous works.",
  category:
    "Your lens: categories and shared properties — what your agents ARE (all animals, all metals, all things in a kitchen), what they are made of, their colour, shape, size or use.",
  fresh:
    "Your lens: look where the obvious ideas don't — set phrases (__ BALL, __ HOUSE), titles, places, brands, professions, things found together, materials, shapes. Link three or more of your agents if one such word truly carries them.",
};

/** The size slots a slot answer fills, largest first ("four" … "one"). */
const SLOT_NAMES = { 4: "four", 3: "three", 2: "two", 1: "one" } as const;
type SlotName = (typeof SLOT_NAMES)[keyof typeof SLOT_NAMES];

function slotsFor(agentsLeft: number): SlotName[] {
  return ideaSizes(agentsLeft).map((n) => SLOT_NAMES[n as 1 | 2 | 3 | 4]);
}

/** How the ideas are asked for: a free list (the lower tiers) or one slot per size. */
function ideasInstruction(input: ClueInput, style: ClueStyle): string {
  const sizes = ideaSizes(input.agentsLeft);
  if (style.many) {
    return [
      `Give up to ${MANY_IDEAS} DIFFERENT clue ideas (different clue words), each linking as many of YOUR agents as one precise word truly carries. Prefer ideas of 3 or 4 words; give a 2-word idea only when it is very strong, and no 1-word ideas.`,
      LENS[style.lens],
      "Then pick the one you would give by its index in `choice`.",
    ]
      .filter((l) => l !== null)
      .join(" ");
  }
  if (!style.slots) {
    return `Give up to ${sizes.length} candidates, one for each size: ${sizes.join(", ")} words. Each links that many of YOUR face-down words — skip a size that has no honest link; fewer, better candidates beat a stretch. Then pick the one you would give by its index in \`choice\`.`;
  }
  return [
    "First, in `groups`, list 3–6 themes that link TWO OR MORE of your agents (the words, and the dangerous non-agent words a reader might take for the same theme). Look past the first meaning of each word: places, phrases, films, idioms, materials, categories.",
    `Then fill EVERY slot in \`ideas\` — ${slotsFor(input.agentsLeft)
      .map((n, i) => `\`${n}\` (${sizes[i]} word${sizes[i] === 1 ? "" : "s"})`)
      .join(
        ", ",
      )}: in each, your best honest clue linking exactly that many of your agents. Try hard for the big slots — build them from your groups. Only when no honest link of that size exists, leave its \`clue\` empty with no targets and say why in \`none\` (otherwise \`none\` is "").`,
    LENS[style.lens],
    "Then name the slot you would give in `choice`.",
  ]
    .filter((l) => l !== null)
    .join(" ");
}

function clueSystem(input: ClueInput, style: ClueStyle = LIST_STYLE): string {
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
      ideasInstruction(input, style),
      "For each candidate: its `targets` are ONLY face-down words from YOUR AGENTS that this clue itself points to — never a bystander, an opponent's agent or the assassin (the card you fear they'll misread goes in `risk`). Each target has `why` (a few words on the link, shown to the players after the game) and `strength`: `obvious` (most players would name it within seconds of hearing the clue), `fair` (a good player gets it), or `stretch` (wordplay, a loose 'can be', a link you have to explain). Stretches are not given: a stretched target is dropped from the clue, and its number shrinks. The number you give is the count of these targets.",
      "Leftovers from your earlier clues do NOT belong in `targets`: list the ones you expect your operatives to take with the extra guess in `leftovers`. Never stretch a new clue to cover a leftover.",
      "`summary`: one plain sentence about the idea that links the targets (and, if it matters, the dangerous card you kept away from). Never mention other candidates, tests, or your thinking process.",
    ].join(" "),
  ]
    .filter((line) => line !== null)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Word dossiers (experiment): every sense, phrase, name and association of a
// table word, written once (`scripts/codenames-dossiers.ts`) and read from the
// file CODENAMES_DOSSIERS points at. Off unless that is set.
// ---------------------------------------------------------------------------

const DossierFileSchema = z.record(
  z.string(),
  z.object({
    senses: z.array(z.string()),
    phrases: z.array(z.string()),
    names: z.array(z.string()),
    associations: z.array(z.string()),
  }),
);
let dossiers: z.infer<typeof DossierFileSchema> | null | undefined;

function dossierFor(language: string, word: string) {
  if (dossiers === undefined) {
    const file = process.env.CODENAMES_DOSSIERS?.trim();
    try {
      dossiers = file ? DossierFileSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : null;
    } catch (err) {
      console.warn(`[codenames] dossiers unreadable: ${causeChain(err)}`);
      dossiers = null;
    }
  }
  return dossiers?.[`${language}:${word.toLowerCase()}`] ?? null;
}

/** The face-down words' dossiers, compact, for a prompt. */
function wordNotes(input: ClueInput): string | null {
  return notesOn(
    input.language,
    input.cards.filter((c) => !c.revealed).map((c) => c.word),
  );
}

function notesOn(language: string, words: readonly string[]): string | null {
  const lines = words
    .map((word) => ({ word }))
    .flatMap((c) => {
      const d = dossierFor(language, c.word);
      if (!d) return [];
      const parts = [
        d.senses.length ? `senses: ${d.senses.join("; ")}` : "",
        d.phrases.length ? `phrases: ${d.phrases.join(", ")}` : "",
        d.names.length ? `names: ${d.names.join(", ")}` : "",
        d.associations.length ? `associations: ${d.associations.join(", ")}` : "",
      ].filter(Boolean);
      return [`- ${c.word.toUpperCase()} — ${parts.join(" | ")}`];
    });
  return lines.length > 0
    ? `WORD NOTES (every meaning and association of the face-down words — use them to find links between YOUR agents, and to spot what a clue could also point at):\n${lines.join("\n")}`
    : null;
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
    wordNotes(input),
    violation ? `YOUR LAST CLUE WAS REJECTED: ${violation} Give a different word.` : null,
  ];
  return sections.filter((s) => s !== null).join("\n\n");
}

const OPERATIVE_PLAYBOOK = `PLAYBOOK
- Rank the face-down words by how strongly the clue points to them, from a typical player's point of view.
- Take at most as many words for the current clue as its number — your spymaster counted them. The extra (+1) guess is only for a word left over from one of YOUR EARLIER clues (name that clue in \`for\`); never spend it on another word for the current clue.
- Words the other team's clue pointed at but that they didn't find are probably theirs — avoid them.
- A miss ends the turn (and may help the other team); the assassin loses the game. When unsure, stop — unless the game is about to be lost anyway.`;

/** How many words a scored operative lists: every guess it may still use, at most its agents left. */
function scoredListLength(input: GuessInput): number {
  return Math.max(
    1,
    Math.min(input.agentsLeft, input.guessesLeft ?? input.agentsLeft, input.words.length),
  );
}

/** The last playbook line for an operative whose stop the code decides from the score. */
const SCORED_STOP =
  "- A miss ends the turn (and may help the other team); the assassin loses the game. You do NOT decide where to stop: list the candidates and the referee stops the turn from the score and your probabilities.";

const SCORED_PLAYBOOK = `PLAYBOOK
- Rank the face-down words by how strongly the clue points to them, from a typical player's point of view.
- Your spymaster's number counts the words for the current clue. A word left over from one of YOUR EARLIER clues (name that clue in \`for\`) usually beats one more word for the current clue; list one more for the current clue only after its number is used, with the lower probability it deserves.
- Words the other team's clue pointed at but that they didn't find are probably theirs — give them low probabilities.
${SCORED_STOP}`;

/** How many words an all-in operative ranks: every guess it may still use, at most its agents left. */
const ALLIN_TEXT = (n: number) =>
  `The other team needs ONE agent and will almost surely win on its next turn, so stopping now loses: the referee touches your list in order until a miss. Rank EXACTLY ${n} face-down word${n === 1 ? "" : "s"} — the most likely ones to be YOUR agents, best first — even when every remaining one is a long shot: what matters is which word is LIKELIER than the others, not how sure you are. Words left over from your earlier clues and more words for the current clue all count (the rules allow the number + 1, for any word). Avoid only the words the other team's clues point at and the likeliest assassin. Give each a probability (0–1) and a few words on why. In \`reasoning\`, say how you read the clue in one sentence.`;

function guessSystem(input: GuessInput, reader = false, scored = false, allin = false): string {
  const lang = LANGUAGE_NAME[input.language];
  return [
    input.mode === "duet"
      ? "You are guessing in Codenames: Duet. Your partner gave a clue pointing at agents on their key. A bystander ends the turn; an assassin loses the game."
      : "You are an operative in Codenames. Your spymaster gave a clue pointing at your team's agents.",
    `The words are ${lang}.`,
    scored || allin
      ? input.mode === "duet"
        ? SCORED_PLAYBOOK.replace(/\n- Words the other team's clue[^\n]*/, "")
        : SCORED_PLAYBOOK
      : OPERATIVE_PLAYBOOK,
    allin
      ? ALLIN_TEXT(scoredListLength(input))
      : scored
        ? `List EXACTLY ${scoredListLength(input)} face-down word${scoredListLength(input) === 1 ? "" : "s"}, in the order you would touch them, each with your honest probability (0–1) that it is one of YOUR agents — calibrated: of the words you call 0.6, six in ten should be ours. The list must be full: after the clear ones, add the best doubtful ones with low probabilities (0.1–0.4 is fine). The referee stops your turn where the score says, so never cut the list short and never inflate. Give each a few words on why — shown to the players after the game. In \`reasoning\`, say how you read the clue in one sentence.`
        : reader
          ? "List the face-down words in the order you would touch them for this clue, as many as the number allows plus one. Confidence 0–1 each."
          : "List only picks you would actually touch, most confident first, each with a confidence (0–1) and a few words on why — they are shown to the players after the game. In `reasoning`, say how you read the clue in one sentence.",
  ].join("\n\n");
}

function guessUser(input: GuessInput, notes = false, scored = false): string {
  const limit = input.guessesLeft === null ? "as many as you like" : String(input.guessesLeft);
  const dossier = notes
    ? notesOn(
        input.language,
        input.words.map((w) => w.word),
      )
    : null;
  return [
    `CLUE: ${input.clue.word.toUpperCase()} ${formatClueCount(input.clue.count)}`,
    `Guesses allowed: ${limit}`,
    `FACE-DOWN WORDS: ${input.words.map((w) => w.word.toUpperCase()).join(", ")}`,
    `SITUATION:\n${guessSituation(input, scored)
      .lines.map((l) => `- ${l}`)
      .join("\n")}`,
    `CLUES SO FAR:\n${historyText(input.history)}`,
    ...(dossier ? [dossier] : []),
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CANDIDATE_JSON = {
  type: "object",
  additionalProperties: false,
  properties: {
    clue: { type: "string", description: "One word." },
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
  required: ["clue", "targets", "leftovers", "risk", "summary"],
} as const;

/** How many ideas a wide brainstorm may give. */
const MANY_IDEAS = 6;

const MANY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: { type: "array", minItems: 1, maxItems: MANY_IDEAS, items: CANDIDATE_JSON },
    choice: {
      type: "integer",
      minimum: 0,
      maximum: MANY_IDEAS - 1,
      description: "Index of the clue to give.",
    },
  },
  required: ["candidates", "choice"],
};

const CLUE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: { type: "array", minItems: 1, maxItems: 4, items: CANDIDATE_JSON },
    choice: { type: "integer", minimum: 0, maximum: 3, description: "Index of the clue to give." },
  },
  required: ["candidates", "choice"],
};

/**
 * The Mastermind's answer: its brainstorm (`groups`, written first — models
 * fill fields in order, so this is thinking in the answer, not extra effort),
 * then one slot per size it must address. A slot is a candidate, or an empty
 * clue with `none` saying why no honest link of that size exists. (No
 * `anyOf`/nullable slots: the plainest shape every provider's structured
 * output accepts.)
 */
function slotsJsonSchema(agentsLeft: number): Record<string, unknown> {
  const slots = slotsFor(agentsLeft);
  const slot = {
    ...CANDIDATE_JSON,
    properties: {
      ...CANDIDATE_JSON.properties,
      none: {
        type: "string",
        description:
          "Empty when this slot has a clue; otherwise why no honest link of this size exists.",
      },
    },
    required: [...CANDIDATE_JSON.required, "none"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      groups: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            theme: { type: "string" },
            words: {
              type: "array",
              items: { type: "string" },
              description: "Your agents it links.",
            },
            danger: {
              type: "string",
              description: "Non-agent words a reader might take for this theme.",
            },
          },
          required: ["theme", "words", "danger"],
        },
      },
      ideas: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(slots.map((name) => [name, slot])),
        required: slots,
      },
      choice: { type: "string", enum: slots, description: "The slot you would give." },
    },
    required: ["groups", "ideas", "choice"],
  };
}

const RawCandidateSchema = z.object({
  clue: z.string(),
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

const RawSlotsSchema = z.object({
  ideas: z.record(z.string(), RawCandidateSchema.extend({ none: z.string().optional() })),
  choice: z.string(),
});

/**
 * A slot answer as the list the rest of the pipeline reads: the filled slots,
 * largest first, the chosen one's index as `choice`. An empty slot (no clue)
 * is the model saying no honest link of that size exists — it isn't listed.
 */
export function slotsToClue(raw: unknown): RawClue {
  const parsed = RawSlotsSchema.parse(raw);
  // Largest first (an object's numeric keys would iterate smallest first).
  const order: string[] = ["four", "three", "two", "one"];
  const filled = Object.entries(parsed.ideas)
    .filter(([, c]) => c.clue.trim() !== "")
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  if (filled.length === 0) throw new Error("the answer filled no slot");
  const choice = Math.max(
    0,
    filled.findIndex(([name]) => name === parsed.choice),
  );
  return { candidates: filled.map(([, { none: _none, ...c }]) => c), choice };
}

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
 * The clue a pick's `for` names, folded: its first word. Guessers write the
 * clue as they see it — "ELECTRIC 3", "electric (earlier clue)" — and a label
 * with its number must still match ELECTRIC, or the +1 on a leftover is lost
 * (whole-game bench: 0 of 84 turns ever used it).
 */
export function clueWordOf(label: string): string {
  return foldWord(label).match(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/u)?.[0] ?? "";
}

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
    const earlier = owed.find((c) => c.word === clueWordOf(pick.for) && c.missing > 0);
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
  "codenames-hard": 0.5,
  // The Mastermind's own operative commits further: its spymaster plays every
  // clue out on exactly this operative (and rules out any that walk into the
  // assassin), so a bolder reader gets clues chosen for it. Env override for the bench.
  "codenames-expert": Number(process.env.CODENAMES_MASTER_FLOOR) || 0.35,
};

/** With the game about to be lost, a long shot beats stopping. */
const DESPERATE_FLOOR = 0.2;

// ---------------------------------------------------------------------------
// Spend: every model call an answer took, for the game's notes
// ---------------------------------------------------------------------------

/**
 * How many Codenames model calls run at once across the whole server. The
 * Mastermind plays its ideas out in dozens of parallel guesses; without a cap
 * a provider's concurrency limit rejects them (seen on the bench). Env
 * `CODENAMES_AI_CONCURRENCY` sets it.
 */
const AI_CONCURRENCY = Math.max(1, Number(process.env.CODENAMES_AI_CONCURRENCY) || 12);
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= AI_CONCURRENCY) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await run();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

class Spend {
  calls = 0;
  usd = 0;
  readonly traceIds: string[] = [];

  async call(args: StructuredGenerateArgs): Promise<unknown> {
    const { output, call } = await withSlot(() => structuredGenerateTraced(args)).catch(
      (err: unknown) => {
        this.calls++;
        throw err;
      },
    );
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

/** The Mastermind answers in size slots; every other tier (and every quick retry) in a list. */
function styleFor(input: ClueInput, quick: boolean): ClueStyle {
  return {
    slots: !quick && testsIdeas(input.model) && masterPart("SLOTS"),
    lens: "main",
  };
}

async function callClue(
  spend: Spend,
  input: ClueInput,
  violation?: string,
  quick = false,
  lens: ClueStyle["lens"] = "main",
  many = false,
  note?: string,
): Promise<RawClue> {
  const budgetMs = quick ? QUICK_CLUE_MS : CLUE_BUDGET_MS;
  const second = lens !== "main";
  const style: ClueStyle = many
    ? { slots: false, many: true, lens }
    : second
      ? { slots: true, lens }
      : styleFor(input, quick);
  // The "big" brainstorm is the tier's own model; the other lenses another, cheaper one.
  const model =
    second && lens !== "big" && lens !== "plan" ? ideasModel() : modelForTier(input.model);
  const call = spend.call({
    feature: "codenames",
    label: note ? "codenames-clue-refine" : second ? `codenames-clue-${lens}` : "codenames-clue",
    modelOverride: model,
    system: clueSystem(input, style),
    user: note ? `${clueUser(input, violation)}\n\n${note}` : clueUser(input, violation),
    schemaName: "codenames_clue",
    jsonSchema: style.many
      ? MANY_JSON_SCHEMA
      : style.slots
        ? slotsJsonSchema(input.agentsLeft)
        : CLUE_JSON_SCHEMA,
    budgetMs,
    // The Mastermind's wide brainstorms think as hard as its main call (they run beside it).
    reasoningEffort: quick
      ? reasoningEffort()
      : second && !many
        ? reasoningEffort()
        : clueEffort(input.model),
  });
  // Transient-error retries live below; this bounds them all together.
  const raw = await withDeadline(call, budgetMs, "the clue call");
  return style.slots ? slotsToClue(raw) : RawClueSchema.parse(raw);
}

/** A candidate clue as the agent plays it. */
export interface Candidate {
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
  // The ∞ agreement (`closesTheBoard`): ∞ exactly when this clue and the words
  // still owed cover every agent left — for people and AI, in both games.
  const unlimited = closesTheBoard(
    input,
    targets.map((t) => t.card),
  );
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
  reader: string,
  budgetMs: number,
): Promise<ReadPick[]> {
  const words = input.cards
    .filter((c) => !c.revealed)
    .map((c) => ({ index: c.index, word: c.word }));
  const readerInput: GuessInput = {
    model: input.model,
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
    modelOverride: reader,
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
 * Who test-reads the Mastermind's ideas: the AI that will guess them (its
 * own tier — exactly how the clue will be read), or, for a person, two
 * different readers whose verdicts are averaged, so a clue has to read well
 * to more than one model's habits. Unknown guessers read as a person.
 */
export function readersFor(input: ClueInput): string[] {
  if (!masterPart("MATCHED_READ")) return [readerModel()];
  const guessers = input.operatives ?? [];
  const ai = guessers.length > 0 && guessers.every((g) => g !== null);
  if (ai) return [modelForTier(guessers[0] as CodenamesAiModel)];
  return [readerModel(), secondReaderModel()];
}

/**
 * How much the spymaster's own pick counts against the reads: one more word
 * the reader is sure of outweighs it; a long shot doesn't.
 */
const OWN_CHOICE_BONUS = 0.3;

/**
 * Mastermind: read every idea through the operatives who will guess it and
 * keep the one whose reading lands best — `readScore`, weighed by the race
 * (`clueUrgency`), averaged over the readers. A 3-word idea that reads cleanly beats a
 * safe single; a stretch the readers only half follow loses to it, and the
 * spymaster's own pick wins anything close.
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
  const readers = readersFor(input);
  const reads = await Promise.all(
    pool.map((c) =>
      Promise.all(
        readers.map((reader) => testRead(spend, input, c.clue, reader, budget).catch(() => null)),
      ).then((all) => all.filter((r): r is ReadPick[] => r !== null)),
    ),
  );
  const kindOf = (card: number) => input.cards.find((c) => c.index === card)?.kind;
  const urgency = clueUrgency(input);
  const scoreOf = (c: Candidate, its: readonly ReadPick[][]) =>
    its.reduce((sum, r) => sum + readScore(r, kindOf, c.clue.count, c.targets, urgency), 0) /
    its.length;
  let best: { pick: Candidate; read: ReadPick[] | null; score: number } = {
    pick: chosen,
    read: null,
    score: Number.NEGATIVE_INFINITY,
  };
  pool.forEach((candidate, i) => {
    const its = reads[i] ?? [];
    if (its.length === 0) return;
    const bonus = i === 0 ? OWN_CHOICE_BONUS : 0;
    const score = scoreOf(candidate, its) + bonus;
    if (score > best.score) best = { pick: candidate, read: its[0] ?? null, score };
  });
  return { pick: best.pick, read: best.read };
}

/**
 * The Mastermind's whole clue step (brainstorms + play-out) aims to be done by
 * here: with a smart-model operative to play ideas out on, an unbounded search
 * ran to 86 s on the bench — too near the machine's 90 s deadline. It gives
 * the best idea it has played out by then.
 */
const SEARCH_STEP_MS = 62_000;
/** The Mastermind plays out at most this many ideas (all three brainstorms pooled). */
const MAX_SIM_IDEAS = 30;
/** …of which this many, after a screen by the strictest guesser, are played out in full. */
const PLAY_IDEAS = 8;
/** The best few after the first play-out are played out once more before one is chosen. */
const REPLAY_IDEAS = 3;
/** Reader-made clues: for this many groups of 3–4 of the leaders' agents… */
const TARGETED_GROUPS = 12;
/** …cut from this many leading ideas (of 3+ targets)… */
const TARGETED_LEADERS = 3;
/** …the time the round needs left to start (its calls, a screen and a play-out)… */
const TARGETED_MIN_MS = 18_000;
/** …the time kept back for the screen and play-out after its calls… */
const TARGETED_PLAY_MS = 12_000;
/** …and how many of its clues (the ones the strictest guesser read 2+ of) are played out in full. */
const TARGETED_PLAY = 4;
/** …and tries this many of the best one number higher. */
const RAISE_IDEAS = 2;
/** …given only after this many play-outs that never touch the assassin. */
const RAISE_PLAYOUTS = 3;
/** What a touch is worth when the Mastermind plays a clue out: the assassin loses the game. */
const OUTCOME = { own: 1, opponent: -1, bystander: 0, assassin: -9 } as const;
/**
 * A play-out that wins the game on the spot, when the other team needs one
 * (`CODENAMES_MASTER_FINISH=0` turns it off). Bench 2026-11-18, 234 paired
 * positions 2v1–4v1: won this turn 38.8 → 43.5 % (t 2.66).
 */
const FINISH_VALUE = 10;
/** The spymaster's own pick wins a tie (a hair, not a word). */
const OWN_PICK_EDGE = 0.1;
/** A clue from the whole-game plan wins close calls: it keeps the rest of the board coverable. */
const PLAN_BONUS = 0.3;
/** A target left for a later +1 guess: half an agent (one may be collected per later turn)… */
const LEFTOVER_VALUE = 0.5;
/** …counted for at most this many. */
const MAX_LEFTOVERS = 2;

/** Who the Mastermind plays its ideas out with: the AI operative itself, or three people of different strength. */
/** Every guesser of this clue is an AI (an all-AI team), so the Mastermind knows exactly who reads it. */
export function aiGuessers(input: ClueInput): boolean {
  const guessers = input.operatives ?? [];
  return guessers.length > 0 && guessers.every((g) => g !== null);
}

export function simulatedGuessers(input: ClueInput): GuessProfile[] {
  const guessers = input.operatives ?? [];
  if (aiGuessers(input)) {
    const profile = profileOf(guessers[0] as CodenamesAiModel);
    // Two samples of the one guesser: a clue must read twice, not once by luck.
    return [profile, profile];
  }
  return judgeProfiles();
}

/**
 * What a clue's unfound targets are worth later: on each of the team's next
 * turns its operatives may spend the extra (+1) guess on a word an earlier
 * clue left behind — an agent found without spending a clue. So a 3 that
 * lands 2 is worth a little more than a 2 that lands 2 (whole-game bench:
 * games ended on 1-word stragglers). Classic only (Duet has no +1 for it).
 */
export function leftoverValue(idea: Candidate, picks: readonly number[], input: ClueInput): number {
  if (input.mode !== "classic") return 0;
  const touched = new Set(picks);
  const left = idea.targets.filter(
    (t) => !touched.has(t) && input.cards.some((c) => c.index === t && c.kind === "own"),
  ).length;
  return LEFTOVER_VALUE * Math.min(left, MAX_LEFTOVERS);
}

/** What a turn of `picks` is worth: own agents until the first miss, the miss priced by what it hits. */
export function playOut(
  picks: readonly number[],
  kindOf: (card: number) => SpymasterCardKind | undefined,
): number {
  let value = 0;
  for (const card of picks) {
    const kind = kindOf(card) ?? "bystander";
    if (kind === "own") {
      value += OUTCOME.own;
      continue;
    }
    return value + OUTCOME[kind];
  }
  return value;
}

/** The operative's view of a clue the spymaster is weighing — public facts only. */
function guessInputFor(input: ClueInput, clue: Clue, tier: CodenamesAiModel): GuessInput {
  return {
    model: tier,
    mode: input.mode,
    language: input.language,
    words: input.cards.filter((c) => !c.revealed).map((c) => ({ index: c.index, word: c.word })),
    clue,
    guessesLeft: typeof clue.count === "number" && clue.count > 0 ? clue.count + 1 : null,
    agentsLeft: input.agentsLeft,
    ...(input.opponentAgentsLeft !== undefined
      ? { opponentAgentsLeft: input.opponentAgentsLeft }
      : {}),
    ...(input.turnsLeft !== undefined ? { turnsLeft: input.turnsLeft } : {}),
    history: input.history.map(({ intended: _secret, ...turn }) => turn),
  };
}

/**
 * Mastermind: play every idea out. Each one is guessed — with the real
 * operative pipeline (its prompt, confidence floor, the +1 rule) — by the
 * players who will guess it (`simulatedGuessers`), and scored by what they
 * actually touch against the key (`playOut`). The best ones are then tried
 * one number higher: the number is the operatives' licence to keep going, and
 * a clue that carries one more word than it was built for is worth finding.
 * Returns the idea whose average turn is best, and what it was expected to find.
 */
/** Every two of `cards`. */
export function pairsOf(cards: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) out.push([cards[i], cards[j]] as number[]);
  return out;
}

/** Every three of `cards` (a group of up to 5 has at most 10). */
export function triplesOf(cards: readonly number[]): number[][] {
  const out: number[][] = [];
  const c = cards.slice(0, 5);
  for (let i = 0; i < c.length; i++)
    for (let j = i + 1; j < c.length; j++)
      for (let k = j + 1; k < c.length; k++) out.push([c[i], c[j], c[k]] as number[]);
  return out;
}

const TARGETED_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    clues: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          word: { type: "string", description: "One word." },
          why: { type: "string", description: "A few words: how it links the targets." },
        },
        required: ["word", "why"],
      },
    },
  },
  required: ["clues"],
};

const RawTargetedSchema = z.object({
  clues: z.array(z.object({ word: z.string(), why: z.string() })),
});

/**
 * A reader names clues for one group: the single words that would make it
 * surest of exactly these agents and of nothing else on the table. Each comes
 * back as a candidate with the group as its targets.
 */
async function targetedClues(
  spend: Spend,
  input: ClueInput,
  group: readonly number[],
  model: string,
): Promise<Candidate[]> {
  const live = input.cards.filter((c) => !c.revealed);
  const word = (card: number) => (live.find((c) => c.index === card)?.word ?? "?").toUpperCase();
  const others = live.filter((c) => !group.includes(c.index)).map((c) => c.word.toUpperCase());
  const raw = await spend.call({
    feature: "codenames",
    label: "codenames-clue-targeted",
    modelOverride: model,
    system: [
      `You help a Codenames spymaster find a clue in ${LANGUAGE_NAME[input.language]}. A clue is ONE word (no spaces, no digits) that must not be, contain or be a form of any word on the table.`,
      "Propose up to 5 clue words that a casual player would IMMEDIATELY and confidently connect to EVERY target word — and to none of the other words on the table. The obvious, literal link beats a clever one.",
    ].join("\n\n"),
    user: `TARGETS: ${group.map(word).join(", ")}\nOTHER WORDS ON THE TABLE (must not fit): ${others.join(", ")}`,
    schemaName: "codenames_targeted",
    jsonSchema: TARGETED_JSON_SCHEMA,
    budgetMs: READ_BUDGET_MS,
    reasoningEffort: "low",
  });
  const targets = [...group];
  return RawTargetedSchema.parse(raw).clues.flatMap((c) => {
    const clueWord = c.word.trim();
    if (!clueWord || /\s/.test(clueWord)) return [];
    return [
      {
        clue: { word: clueWord, count: Math.min(MAX_CLUE_COUNT, targets.length) },
        targets,
        links: targets.map((card) => ({ card, why: c.why.trim() })),
        leftover: [],
        summary: c.why.trim(),
      },
    ];
  });
}

async function bestByPlayOut(
  spend: Spend,
  input: ClueInput,
  pool: Candidate[],
  startedAt: number,
  legal: (c: Candidate) => boolean,
  /** Extra worth an idea carries beyond its turn (part of the whole-game plan). */
  bonus: (idea: Candidate) => number = () => 0,
): Promise<{ pick: Candidate; expected: number | null }> {
  const [chosen] = pool;
  if (!chosen) throw new Error("no candidate");
  const kindOf = (card: number) => input.cards.find((c) => c.index === card)?.kind;
  const guessers = simulatedGuessers(input);
  // The search answers well inside the machine's 90 s deadline, however many ideas are left.
  const timeLeft = () => SEARCH_STEP_MS - (Date.now() - startedAt);

  /** Each idea's play-outs: their values. */
  const turns = new Map<Candidate, number[]>();
  /** A one-higher variant → the clue it raises. */
  const raisedOf = new Map<Candidate, Candidate>();
  const doomed = new Set<Candidate>();
  // With the other team one agent from winning, only finishing now counts:
  // a play-out that finds every agent left is worth FINISH_VALUE more, and a
  // clue that ever finishes is not ruled out by the assassin (losing either way).
  const finishMode =
    masterPart("FINISH") && input.mode === "classic" && (input.opponentAgentsLeft ?? 99) <= 1;
  const finishes = (picks: readonly number[]) => {
    let found = 0;
    for (const card of picks) {
      if (kindOf(card) !== "own") return false;
      if (++found >= input.agentsLeft) return true;
    }
    return false;
  };

  const playAll = async (ideas: readonly Candidate[]) => {
    const budget = Math.min(GUESS_BUDGET_MS, timeLeft() - 2_000);
    await Promise.all(
      ideas.map(async (idea) => {
        const outs = await Promise.all(
          guessers.map((g) =>
            runGuess(spend, guessInputFor(input, idea.clue, input.model), g, budget)
              .then((out) => ({ g, out }))
              .catch(() => null),
          ),
        );
        // An idea is scored only on a complete play-out: a guess that failed is no evidence.
        if (outs.some((o) => o === null)) return;
        const done = outs as { g: GuessProfile; out: Awaited<ReturnType<typeof runGuess>> }[];
        const values = done.map(
          ({ out }) =>
            playOut(out.picks, kindOf) +
            // Off unless CODENAMES_MASTER_LEFTOVERS=1: whole games found no gain
            // (1.86 v 1.89 without) and it favoured bold clues that land one.
            (process.env.CODENAMES_MASTER_LEFTOVERS === "1"
              ? leftoverValue(idea, out.picks, input)
              : 0) +
            (finishMode && finishes(out.picks) ? FINISH_VALUE : 0),
        );
        // A clue that ever walks a guesser into the assassin is not given.
        if (
          done.some(({ out }) => out.picks.some((c) => kindOf(c) === "assassin")) &&
          !(finishMode && done.some(({ out }) => finishes(out.picks)))
        ) {
          doomed.add(idea);
        }
        turns.set(idea, [
          ...(turns.get(idea) ?? []),
          values.reduce((a, b) => a + b, 0) / values.length,
        ]);
      }),
    );
  };
  const meanOf = (idea: Candidate) => {
    const vs = turns.get(idea) ?? [];
    return (
      vs.reduce((a, b) => a + b, 0) / vs.length +
      (idea === chosen ? OWN_PICK_EDGE : 0) +
      bonus(idea)
    );
  };
  const ranked = () =>
    [...turns.keys()].filter((i) => !doomed.has(i)).sort((a, b) => meanOf(b) - meanOf(a));

  if (timeLeft() < MIN_READ_MS) return { pick: chosen, expected: null };
  // Screen: every idea through the strictest guesser alone (one cheap call
  // each) — it is the one that holds clues back — and the best go on to the
  // full play-out.
  let field = pool;
  const strict = guessers.reduce((a, b) => (b.floor > a.floor ? b : a));
  if (pool.length > PLAY_IDEAS && guessers.length > 1) {
    const budget = Math.min(GUESS_BUDGET_MS, timeLeft() - 2_000);
    const screened = await Promise.all(
      pool.map((idea) =>
        runGuess(spend, guessInputFor(input, idea.clue, input.model), strict, budget)
          .then((out) => playOut(out.picks, kindOf))
          .catch(() => Number.NEGATIVE_INFINITY),
      ),
    );
    field = pool
      .map((idea, i) => ({ idea, v: (screened[i] ?? 0) + (idea === chosen ? OWN_PICK_EDGE : 0) }))
      .sort((a, b) => b.v - a.v || b.idea.targets.length - a.idea.targets.length)
      .slice(0, PLAY_IDEAS)
      .map((s) => s.idea);
  }
  await playAll(field);
  if (ranked().length === 0) return { pick: chosen, expected: null };

  // Reader-made clues: for the most promising groups of agents, the readers
  // themselves (the fast and balanced models) name the one word they would
  // be surest of for exactly those agents — clues obvious to a literal reader
  // are what a casual table needs. They are screened and played out like the rest.
  if (masterPart("TARGETED") && timeLeft() >= TARGETED_MIN_MS) {
    // Triples: a pair tops out at 2 found, and a 3-word clue the literal reader
    // takes in full is what lifts a turn above that. The leaders' groups, cut
    // into every three of their agents, plus any full group of 3–4.
    const groups: number[][] = [];
    const keyOf = (g: readonly number[]) => [...g].sort((x, y) => x - y).join(",");
    const add = (g: number[]) => {
      if (groups.length < TARGETED_GROUPS && !groups.some((h) => keyOf(h) === keyOf(g)))
        groups.push(g);
    };
    const leaders = ranked()
      .filter((i) => i.targets.length >= 3)
      .slice(0, TARGETED_LEADERS);
    for (const idea of leaders) if (idea.targets.length <= 4) add([...idea.targets]);
    // Late in the game every three of the agents left is a group worth a clue
    // (no leader may link three yet) — and all of them together, up to four.
    const left = input.cards.filter((c) => !c.revealed && c.kind === "own").map((c) => c.index);
    if (left.length <= 5) {
      if (left.length >= 3 && left.length <= 4) add(left);
      for (const triple of triplesOf(left)) add(triple);
    }
    // The endgame's stragglers: a clue for two of them saves a whole turn over
    // two singles (whole-game bench: games ended KETCHUP 1, TOMORROW 1).
    if (left.length <= 4) for (const pair of pairsOf(left)) add(pair);
    for (const idea of leaders) for (const triple of triplesOf(idea.targets)) add(triple);
    const known = new Set([...turns.keys()].map((i) => foldWord(i.clue.word)));
    const proposals = await within(
      Promise.all(
        groups.flatMap((group) =>
          [secondReaderModel(), modelForTier(input.model)].map((model) =>
            targetedClues(spend, input, group, model).catch(() => [] as Candidate[]),
          ),
        ),
      ),
      Math.max(0, timeLeft() - TARGETED_PLAY_MS),
    );
    const fresh: Candidate[] = [];
    for (const c of (proposals ?? []).flat()) {
      const word = foldWord(c.clue.word);
      if (!known.has(word) && legal(c)) {
        known.add(word);
        fresh.push(c);
      }
    }
    if (fresh.length > 0 && timeLeft() >= MIN_READ_MS) {
      const budget = Math.min(GUESS_BUDGET_MS, timeLeft() - 2_000);
      const screened = await Promise.all(
        fresh.map((idea) =>
          runGuess(spend, guessInputFor(input, idea.clue, input.model), strict, budget)
            .then((out) => playOut(out.picks, kindOf))
            .catch(() => Number.NEGATIVE_INFINITY),
        ),
      );
      const best = fresh
        .map((idea, i) => ({ idea, v: screened[i] ?? 0 }))
        // The strictest guesser must take two of a group to earn a play-out.
        .filter((s) => s.v >= 2)
        .sort((a, b) => b.v - a.v)
        .slice(0, TARGETED_PLAY)
        .map((s) => s.idea);
      if (best.length > 0 && timeLeft() >= MIN_READ_MS) await playAll(best);
    }
  }

  // Second look: the leaders again, and the best few one number higher (the
  // number is the operatives' licence to keep going) — played out twice, like
  // the leaders, so a raise never wins on one lucky turn.
  if (timeLeft() >= MIN_READ_MS) {
    const leaders = ranked().slice(0, REPLAY_IDEAS);
    // Each leader also one number higher. Never up to every agent left: that
    // claim is the ∞ agreement's, and a number there would say one is undescribed.
    const owed = pendingTargets(input).reduce((n, p) => n + p.words.length, 0);
    const raised: Candidate[] = masterPart("RAISE")
      ? leaders.slice(0, RAISE_IDEAS).flatMap((idea) => {
          const n = idea.clue.count;
          if (typeof n !== "number" || n + 1 + owed >= input.agentsLeft) return [];
          const higher: Candidate = { ...idea, clue: { word: idea.clue.word, count: n + 1 } };
          raisedOf.set(higher, idea);
          return [higher];
        })
      : [];
    await playAll([...leaders, ...raised]);
    // A third look at the new leaders (raised ones included): the choice rests
    // on three play-outs, not on one lucky turn.
    if (timeLeft() >= MIN_READ_MS) await playAll(ranked().slice(0, REPLAY_IDEAS));
  }
  // A raised number lets them wander: three clean play-outs first (a bench run
  // gave KINDERGARTEN 4 into the assassin).
  const trusted = (idea: Candidate) =>
    !raisedOf.has(idea) || (!doomed.has(idea) && (turns.get(idea)?.length ?? 0) >= RAISE_PLAYOUTS);
  for (const idea of ranked()
    .filter((i) => raisedOf.has(i))
    .slice(0, 2)) {
    while ((turns.get(idea)?.length ?? 0) < RAISE_PLAYOUTS && !doomed.has(idea)) {
      if (timeLeft() < MIN_READ_MS) break;
      await playAll([idea]);
    }
  }
  const best = ranked().find(trusted) ?? chosen;
  if (process.env.CODENAMES_DEBUG === "1") {
    console.info(
      `[codenames] play-out: ${ranked()
        .slice(0, 4)
        .map((i) => `${i.clue.word} ${i.clue.count}=${meanOf(i).toFixed(2)}`)
        .join(", ")} (of ${turns.size}, ${doomed.size} doomed)`,
    );
  }
  return { pick: best, expected: turns.has(best) ? meanOf(best) : null };
}

/** `promise`'s value if it settles within `ms`, else null (it is left to finish on its own). */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
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
  const candidatesOf = (answer: RawClue | null) => {
    if (!answer) return [];
    const all = answer.candidates.map((c) => toCandidate(c, input));
    const chosen = all[answer.choice] ?? all[0] ?? null;
    // The model's choice first, then the rest — all legal, all aimed at something.
    return [chosen, ...all.filter((c) => c !== chosen)].filter(
      (c): c is Candidate => c !== null && legal(c) && (c.targets.length > 0 || c.clue.count === 0),
    );
  };
  const master = testsIdeas(input.model);
  const search = input.model === "codenames-expert";
  // The Mastermind's extras are wide lists; the Analyst's is one idea per size.
  const brainstorm = (lens: Exclude<ClueStyle["lens"], "main">) =>
    callClue(spend, input, undefined, false, lens, search).catch((err: unknown) => {
      console.warn(`[codenames] ${lens} brainstorm failed: ${causeChain(err)}`);
      return null;
    });
  try {
    // Extra brainstorms run beside the main call on another model — the
    // biggest honest group (Analyst and Mastermind), and a fresh angle
    // (Mastermind). They never hold the clue up for long.
    // The whole-game plan: every remaining agent covered in the fewest clues.
    const planned =
      // Opt-in (CODENAMES_MASTER_PLAN=1): whole games measured 1.85 with it v ~1.84 without.
      search && process.env.CODENAMES_MASTER_PLAN === "1" && input.mode === "classic"
        ? brainstorm("plan")
        : Promise.resolve(null);
    const extras = [
      master && masterPart("SECOND_CALL") ? brainstorm("bold") : Promise.resolve(null),
      ...(search
        ? (["fresh", "phrase", "category", "big"] as const).map((lens) => brainstorm(lens))
        : []),
    ];
    const first = await callClue(spend, input).catch((err: unknown) => {
      console.warn(`[codenames] slow or failed clue; asking quickly: ${causeChain(err)}`);
      return callClue(spend, input, undefined, true);
    });
    let pool = candidatesOf(first);
    const plan = candidatesOf(await within(planned, SECOND_GRACE_MS));
    const planWords = new Set(plan.map((c) => foldWord(c.clue.word)));
    const extra = [
      ...(await Promise.all(extras.map((e) => within(e, SECOND_GRACE_MS)))).flatMap(candidatesOf),
      ...plan,
    ];
    const words = new Set(pool.map((c) => foldWord(c.clue.word)));
    for (const c of extra) {
      if (!words.has(foldWord(c.clue.word))) {
        words.add(foldWord(c.clue.word));
        pool.push(c);
      }
    }
    if (pool.length === 0) {
      pool = candidatesOf(
        await callClue(spend, input, "none of your candidates was a legal clue for the table."),
      );
    }
    if (pool.length === 0) return { ...fallbackClue(input), ...spend.fields };

    const { pick, read } = search
      ? {
          ...(await bestByPlayOut(
            spend,
            input,
            pool.slice(0, MAX_SIM_IDEAS),
            startedAt,
            legal,
            (idea) => (planWords.has(foldWord(idea.clue.word)) ? PLAN_BONUS : 0),
          )),
          read: null,
        }
      : master
        ? await bestByTestRead(spend, input, pool.slice(0, MAX_READ_IDEAS), startedAt)
        : { pick: pool[0] as Candidate, read: null };
    return {
      ...pick.clue,
      targets: pick.targets,
      links: pick.links,
      leftover: pick.leftover,
      reasoning: pick.summary,
      considered: pool
        .filter((c) => c.clue.word !== pick.clue.word)
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

/** How an operative guesses: the model it runs on and how sure it must be to touch again. */
export interface GuessProfile {
  name: string;
  /** Registry id (`lib/ai/models.ts`). */
  model: string;
  /** Picks after the first stop below this confidence. */
  floor: number;
  /**
   * `score`: the classic game's stop is decided by the race (`stop-rule.ts`:
   * each touch taken while it raises the win chance), from honest
   * probabilities over a longer list; `floor` (default) stops below `floor`.
   */
  stop?: "floor" | "score";
  /**
   * `allin`: with the other team one agent from winning (stopping loses), the
   * operative ranks the best candidates by RELATIVE likelihood and every
   * guess the rules allow is taken in that order — the +1 included, for any
   * word, no confidence floor. `floor` (default): today's desperate floor.
   */
  desperate?: "floor" | "allin";
  /**
   * Reads the word dossiers too (CODENAMES_DOSSIERS) — a tier's own AI
   * operative, sharing its spymaster's knowledge. Never the "people" judges.
   */
  notes?: boolean;
}

/** How a tier's own AI operative guesses. */
export function profileOf(tier: CodenamesAiModel): GuessProfile {
  return {
    name: tier,
    model: modelForTier(tier),
    floor: CONFIDENCE_FLOOR[tier],
    notes: Boolean(process.env.CODENAMES_DOSSIERS?.trim()),
  };
}

/**
 * Three operatives of different strength — the fast, balanced and smart
 * roles at confidence floors 0.7 / 0.6 / 0.5 (the Scout, the old Analyst and
 * the old Mastermind as guessers). The bench's fixed judges, and how the
 * Mastermind pictures a table of people it can't see.
 */
export function judgeProfiles(): GuessProfile[] {
  return [
    { name: "fast/0.7", model: tierModel("CODENAMES_JUDGE_FAST", "fast"), floor: 0.7 },
    { name: "balanced/0.6", model: tierModel("CODENAMES_JUDGE_BALANCED", "balanced"), floor: 0.6 },
    { name: "smart/0.5", model: tierModel("CODENAMES_JUDGE_SMART", "smart"), floor: 0.5 },
  ];
}

/** One operative's picks for the clue in `input`, as `profile` plays them. Throws on any failure. */
async function runGuess(
  spend: Spend,
  input: GuessInput,
  profile: GuessProfile,
  budgetMs = GUESS_BUDGET_MS,
): Promise<{
  picks: number[];
  notes: NonNullable<GuessOutput["notes"]>;
  reasoning: string;
  /** Every listed pick in order, before the stop — for the bench. */
  listed: { index: number; confidence: number; why: string; earlier: boolean }[];
}> {
  // Scored: the race decides the stop (classic or Duet); sudden death keeps the floor.
  const race =
    profile.stop === "score" &&
    (stopStateOf(input) !== null || (input.mode === "duet" && (input.turnsLeft ?? 0) > 0));
  const allin =
    !race &&
    profile.desperate === "allin" &&
    input.mode === "classic" &&
    guessSituation(input).urgency === "desperate";
  const raw = await spend.call({
    feature: "codenames",
    label: "codenames-guess",
    modelOverride: profile.model,
    system: guessSystem(input, false, race, allin),
    user: guessUser(input, profile.notes === true, race || allin),
    schemaName: "codenames_guess",
    jsonSchema: GUESS_JSON_SCHEMA,
    budgetMs,
    reasoningEffort: guessEffort(),
  });
  const parsed = RawGuessSchema.parse(raw);
  const listed: { index: number; confidence: number; why: string; earlier: boolean }[] = [];
  const thisClue = foldWord(input.clue.word);
  // Scored: only the rules' limit (number + 1); whether the extra goes to a
  // leftover or one more for this clue is the race's call, from the probabilities.
  const allowed =
    race || allin
      ? parsed.picks.slice(0, input.guessesLeft ?? undefined)
      : capPicks(parsed.picks, input);
  for (const pick of allowed) {
    const index = indexOfWord(input.words, pick.word);
    if (index === null || listed.some((l) => l.index === index)) continue;
    // A word named for an earlier clue of ours is an owed word, not one more for this clue.
    const earlier = clueWordOf(pick.for) !== thisClue && clueWordOf(pick.for) !== "";
    listed.push({ index, confidence: pick.confidence, why: pick.why, earlier });
  }
  let take: number;
  if (allin) {
    take = Math.min(listed.length, input.agentsLeft);
  } else if (race) {
    take = scoredTake(input, oddsOfListed(listed, input.clue.count));
  } else {
    const desperate = guessSituation(input).urgency === "desperate";
    const floor = desperate ? DESPERATE_FLOOR : profile.floor;
    take = listed.findIndex((l, i) => i > 0 && l.confidence < floor);
    if (take === -1) take = listed.length;
  }
  const kept = listed.slice(0, take);
  const picks = kept.map((l) => l.index);
  const notes: NonNullable<GuessOutput["notes"]> = kept.map((l) => ({
    card: l.index,
    confidence: l.confidence,
    why: l.why,
  }));
  return { picks, notes, reasoning: parsed.reasoning, listed };
}

/** An operative's turn as `profile` plays it — the stand-in's picks if the model fails. */
export async function guessWith(input: GuessInput, profile: GuessProfile): Promise<GuessOutput> {
  const spend = new Spend();
  try {
    const { listed: _listed, ...out } = await runGuess(spend, input, profile);
    if (out.picks.length === 0) return { ...fallbackGuess(input), ...spend.fields };
    return { ...out, ...spend.fields };
  } catch (err) {
    console.error(`[codenames] guess failed; using fallback: ${causeChain(err)}`);
    return { ...fallbackGuess(input), ...spend.fields };
  }
}

/** The bench's view of a guess: every listed pick with its probability, before the stop. */
export async function guessListed(input: GuessInput, profile: GuessProfile) {
  const spend = new Spend();
  const out = await runGuess(spend, input, profile);
  return { ...out, usd: spend.fields.cost?.usd ?? 0 };
}

async function guess(input: GuessInput): Promise<GuessOutput> {
  return guessWith(input, profileOf(codenamesModelOf(input.model)));
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
