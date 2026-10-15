/**
 * What a clue or a round of guessing *meant* — kept beside the turn it
 * belongs to, for the end-of-game review. Shared by Codenames and Duet.
 *
 * A clue's note names the cards it was aimed at, so it is as secret as the
 * key: player views carry it only to whoever already sees that side of the
 * key, and to everyone once the game is over. A guess note (an AI
 * operative's ranking and confidence) holds no key information.
 */
import { z } from "zod";
import { ClueCountSchema } from "./clue-rules";

export const MAX_NOTE_LENGTH = 600;
const MAX_CONSIDERED = 3;

const CardIndexSchema = z.number().int().min(0).max(24);
const NoteTextSchema = z.string().max(MAX_NOTE_LENGTH).nullable();

export const ConsideredClueSchema = z.object({
  word: z.string().max(30),
  count: ClueCountSchema,
  targets: z.array(CardIndexSchema).max(9),
});
export type ConsideredClue = z.infer<typeof ConsideredClueSchema>;

/** What an AI call cost, as the gateway billed it — for debugging, never shown. */
export const AiCostSchema = z.object({
  calls: z.number().int().min(0),
  usd: z.number().min(0),
});
export type AiCost = z.infer<typeof AiCostSchema>;

/** One target, and why the clue points at it. */
export const TargetLinkSchema = z.object({
  card: CardIndexSchema,
  why: z.string().max(200),
});
export type TargetLink = z.infer<typeof TargetLinkSchema>;

const TraceIdsSchema = z.array(z.string().max(40)).max(12);

export const ClueNoteSchema = z.object({
  /** The cards the clue was aimed at (as the spymaster meant it). */
  targets: z.array(CardIndexSchema).max(25),
  /** Per target: why the clue points at it (AI). Absent in older games. */
  links: z.array(TargetLinkSchema).max(25).default([]),
  /** Earlier clues' leftovers the spymaster meant the extra guess for. */
  leftover: z.array(CardIndexSchema).max(25).default([]),
  /** One sentence on the idea linking the targets; null for a person. */
  reasoning: NoteTextSchema,
  /** Other clues an AI spymaster weighed. */
  considered: z.array(ConsideredClueSchema).max(MAX_CONSIDERED),
  /** How a test reader (an operative model without the key) ranked the table for it. */
  testRead: z.array(CardIndexSchema).max(25).nullable(),
  /** The deterministic stand-in played it (the AI was unavailable or misbehaved). */
  standIn: z.boolean(),
  cost: AiCostSchema.nullable().default(null),
  /** The server's AI ledger ids for this clue's calls (`scratch/ai-traces/*.jsonl`). */
  traceIds: TraceIdsSchema.default([]),
});
export type ClueNote = z.infer<typeof ClueNoteSchema>;

export const GuessPickSchema = z.object({
  card: CardIndexSchema,
  /** 0–1, as the AI rated it; null when it gave none. */
  confidence: z.number().min(0).max(1).nullable(),
  why: NoteTextSchema,
});
export type GuessPick = z.infer<typeof GuessPickSchema>;

export const GuessNoteSchema = z.object({
  /** The cards the AI meant to touch, in order (the turn may have ended sooner). */
  picks: z.array(GuessPickSchema).max(25),
  reasoning: NoteTextSchema,
  standIn: z.boolean(),
  cost: AiCostSchema.nullable().default(null),
  traceIds: TraceIdsSchema.default([]),
});
export type GuessNote = z.infer<typeof GuessNoteSchema>;

/** A person's clue: the cards they tapped as its targets, nothing else. */
export function personClueNote(targets: readonly number[]): ClueNote {
  return {
    targets: [...targets],
    links: [],
    leftover: [],
    reasoning: null,
    considered: [],
    testRead: null,
    standIn: false,
    cost: null,
    traceIds: [],
  };
}

/** A model's reported cost, if it is one. */
export function cleanCost(raw: unknown): AiCost | null {
  const parsed = AiCostSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function cleanTraceIds(raw: unknown): string[] {
  const parsed = TraceIdsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Every AI call a game's notes recorded, summed. */
export function aiCostOf(
  turns: readonly {
    note?: ClueNote;
    guessNotes?: readonly GuessNote[];
    appeals?: readonly { cost?: AiCost }[];
  }[],
): AiCost {
  let calls = 0;
  let usd = 0;
  for (const t of turns) {
    for (const cost of [
      t.note?.cost,
      ...(t.guessNotes ?? []).map((n) => n.cost),
      ...(t.appeals ?? []).map((a) => a.cost),
    ]) {
      if (!cost) continue;
      calls += cost.calls;
      usd += cost.usd;
    }
  }
  return { calls, usd };
}

/** Distinct, in-range cards from `raw` that pass `keep`, in order. */
export function cleanCards(raw: readonly unknown[], keep: (card: number) => boolean): number[] {
  const out: number[] = [];
  for (const value of raw) {
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < 25 &&
      keep(value) &&
      !out.includes(value)
    ) {
      out.push(value);
    }
  }
  return out;
}

/** Trim free text from a model to the note limit; blank → null. */
export function cleanNoteText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  return text.length > MAX_NOTE_LENGTH ? `${text.slice(0, MAX_NOTE_LENGTH - 1)}…` : text;
}

export const MAX_CONSIDERED_CLUES = MAX_CONSIDERED;
