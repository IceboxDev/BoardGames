/**
 * What an AI clue or guess *meant* — kept on the transmission it belongs to,
 * for the debrief. An encrypt note names the keyword behind every clue, so
 * player views carry notes only once the game is over (`player-view.ts`).
 *
 * Notes come from the injected agent and are never trusted: the machine
 * parses them with these schemas and drops anything malformed.
 */
import { z } from "zod";
import { AiCostSchema } from "../codenames/notes";

export const MAX_NOTE_TEXT = 240;

const TextSchema = z.string().max(MAX_NOTE_TEXT).nullable();
const DigitSchema = z.number().int().min(1).max(4);
const CodeSchema = z.tuple([DigitSchema, DigitSchema, DigitSchema]);
const ChanceSchema = z.number().min(0).max(1);
const TraceIdsSchema = z.array(z.string().max(40)).max(40);

export const ClueLinkSchema = z.object({
  /** How the clue points at its keyword, in a short phrase. */
  link: TextSchema,
  /** Why an outsider reading only the public table should go elsewhere. */
  cover: TextSchema,
});
export type ClueLink = z.infer<typeof ClueLinkSchema>;

export const ClueSearchSchema = z.object({
  /** Candidate clues read per code position. */
  pooled: z.array(z.number().int().min(0).max(99)).max(3),
  /** Estimated chances the teammate decodes / the rival intercepts the pick. */
  decode: ChanceSchema,
  intercept: ChanceSchema,
  /** Keywords the rival could name once these clues are public (0–3). */
  exposure: z.number().min(0).max(3),
  /** Play-outs on the real teammate and rival: hits / tries. */
  playOut: z.object({ decode: z.string().max(8), intercept: z.string().max(8) }).nullable(),
  /** Runner-up triples the search weighed. */
  alternatives: z
    .array(
      z.object({
        clues: z.tuple([z.string().max(40), z.string().max(40), z.string().max(40)]),
        decode: ChanceSchema,
        intercept: ChanceSchema,
      }),
    )
    .max(2),
});
export type ClueSearch = z.infer<typeof ClueSearchSchema>;

export const ClueNoteSchema = z.object({
  /** One per clue, in code order. */
  clues: z.array(ClueLinkSchema).length(3),
  /** What the encryptor believed the rival reads from its public table. */
  tableRead: TextSchema,
  /** The Mastermind search's working; null for a one-call tier. */
  search: ClueSearchSchema.nullable().default(null),
  /** The deterministic stand-in played (the AI was unavailable or misbehaved). */
  standIn: z.boolean(),
  cost: AiCostSchema.nullable().default(null),
  traceIds: TraceIdsSchema.default([]),
});
export type ClueNote = z.infer<typeof ClueNoteSchema>;

export const GuessPickNoteSchema = z.object({
  digit: DigitSchema,
  why: TextSchema,
  /** Chances over digits 1–4 for this clue, when the AI gave them. */
  chances: z.array(ChanceSchema).length(4).nullable(),
});
export type GuessPickNote = z.infer<typeof GuessPickNoteSchema>;

export const CANDIDATE_SOURCES = ["table", "average", "one-call", "verdict"] as const;

export const GuessNoteSchema = z.object({
  purpose: z.enum(["decode", "intercept"]),
  /** One per clue, in clue order. */
  picks: z.array(GuessPickNoteSchema).length(3),
  /** What the AI took each column (digit 1–4) to mean. */
  columns: z.array(TextSchema).length(4).nullable().default(null),
  /** Mastermind: the codes its methods proposed before one was chosen. */
  candidates: z
    .array(z.object({ code: CodeSchema, from: z.enum(CANDIDATE_SOURCES) }))
    .max(8)
    .default([]),
  /** Mastermind: the adjudicator's weighing of the candidates. */
  verdict: TextSchema.default(null),
  standIn: z.boolean(),
  cost: AiCostSchema.nullable().default(null),
  traceIds: TraceIdsSchema.default([]),
});
export type GuessNote = z.infer<typeof GuessNoteSchema>;

/** Free model text → one trimmed line within the note limit; blank → null. */
export function noteText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > MAX_NOTE_TEXT ? `${text.slice(0, MAX_NOTE_TEXT - 1)}…` : text;
}

/** An untrusted note → a valid one, or null. */
export function parseClueNote(raw: unknown): ClueNote | null {
  const parsed = ClueNoteSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseGuessNote(raw: unknown): GuessNote | null {
  const parsed = GuessNoteSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const STAND_IN_CLUE_NOTE: ClueNote = {
  clues: [0, 1, 2].map(() => ({ link: null, cover: null })),
  tableRead: null,
  search: null,
  standIn: true,
  cost: null,
  traceIds: [],
};

export function standInGuessNote(
  purpose: "decode" | "intercept",
  code: readonly number[],
): GuessNote {
  return {
    purpose,
    picks: code.slice(0, 3).map((d) => ({ digit: d, why: null, chances: null })),
    columns: null,
    candidates: [],
    verdict: null,
    standIn: true,
    cost: null,
    traceIds: [],
  };
}
