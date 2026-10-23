// The history file's shapes (`history.ts` has the format, the hashes, the
// diffs and the integrity checks). Kept apart from them because these are
// browser-safe: the wire protocol and the web import them, and `history.ts`
// needs `node:crypto`.

import { z } from "zod";
import { ArticleIdSchema, SourceIdSchema } from "./content-types.ts";

export const HISTORY_KINDS = [
  /** The question as printed on a game's card, verbatim. */
  "printed",
  /** Brought over from an earlier format or import (the first Quiztopia bank). */
  "imported",
  /** A new article, fact or generated question written by us. */
  "created",
  /** The question's wording changed — a yes/no or choice card made open, clearer phrasing. */
  "reworded",
  /** The printed card itself is wrong (premise, answer, misprint) and the bank corrects it. */
  "errata",
  /** A factual correction of an answer, body, note, date or source. */
  "corrected",
  /** Text translated (Russian added, a language brought in line with the others). */
  "translated",
  /** Answer marks placed or moved to the sentence that gives the answer. */
  "marked",
  /** Images added, replaced or re-captioned. */
  "illustrated",
  /** A fact split off another, or an article split in two. */
  "split",
  /** Two facts or articles merged; a printed card attached to a fact. */
  "merged",
  /** A fact moved to another article. */
  "moved",
  /** Taken out of the active bank (kept, never deleted). */
  "retired",
  /** Put back into the active bank. */
  "restored",
  /** Any other edit (wording polish, grammar, structure). */
  "edited",
  /** Kept as is but flagged for review (a claim that couldn't be fully confirmed). */
  "flagged",
  /** The entity's state sealed at a point in time, no change of its own. */
  "checkpoint",
  /** The article moved to another domain or sub-category. */
  "recategorised",
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

/**
 * What an entry is about. `card` entries (a printed card's slots) live in
 * `history/cards/<source>.json`, keyed `<card>`; `article-retirement` marks
 * an article leaving or re-entering play (its id is the article's).
 */
export const HISTORY_TARGET_TYPES = [
  "article",
  "fact",
  "wording",
  "card",
  "article-retirement",
] as const;
export type HistoryTargetType = (typeof HISTORY_TARGET_TYPES)[number];

/**
 * A word-level diff from the old text to the new: `["=", n]` keeps the next
 * n tokens, `["-", text]` removes text, `["+", text]` inserts it. Tokens are
 * runs of non-space or of whitespace, so applying the ops is exact.
 */
export const TextDiffOpSchema = z.union([
  z.tuple([z.literal("="), z.number().int().positive()]),
  z.tuple([z.literal("-"), z.string()]),
  z.tuple([z.literal("+"), z.string()]),
]);
export type TextDiffOp = z.infer<typeof TextDiffOpSchema>;

export const HistoryChangeSchema = z
  .object({
    field: z.string().min(1),
    old: z.unknown().optional(),
    new: z.unknown().optional(),
    diff: z.array(TextDiffOpSchema).optional(),
  })
  .refine((c) => !(c.diff && (c.old !== undefined || c.new !== undefined)), {
    message: "a change stores whole values or a diff, not both",
  });
export type HistoryChange = z.infer<typeof HistoryChangeSchema>;

export const HistorySourceSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().optional(),
});

export const ACTOR_KINDS = ["human", "agent", "script"] as const;
/** Who made a change, structured (`by` stays the free-text name). */
export const HistoryActorSchema = z.object({
  kind: z.enum(ACTOR_KINDS),
  /** "owner", "coordinator", "quiz-ingest", "enrich batch 042" … */
  name: z.string().min(1),
  /** The model an agent ran on. */
  model: z.string().min(1).optional(),
});
export type HistoryActor = z.infer<typeof HistoryActorSchema>;

export const CONFIDENCES = ["high", "medium", "low"] as const;
export const ConfidenceSchema = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** A run id: the batch a change belongs to (`packages/quiz-archive/runs/<run>/`). */
export const RunIdSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/);
/** A chain link: sha256 hex (`entryChain`). */
export const ChainSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const HistoryEntrySchema = z.object({
  /** Order within the file, strictly increasing. */
  seq: z.number().int().positive(),
  /** When the change was made, `YYYY-MM-DD`. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(HISTORY_KINDS),
  target: z.object({ type: z.enum(HISTORY_TARGET_TYPES), id: z.string().min(1) }),
  /** Why — in English, for a reader who wasn't there. */
  reason: z.string().min(1),
  /** Who made it: "owner", "coordinator", "enrich batch 042", "merge art/painting" … */
  by: z.string().min(1),
  /** Where the full context lives (a report, a decision file, a card photo). */
  ref: z.string().optional(),
  /** Evidence for the change. */
  sources: z.array(HistorySourceSchema).optional(),
  changes: z.array(HistoryChangeSchema).optional(),
  /** The entity's hash after this entry (`entityHash`); required on every tracked entry. */
  hash: z
    .string()
    .regex(/^[0-9a-f]{12}$/)
    .optional(),
  /** Who made it, structured. */
  actor: HistoryActorSchema.optional(),
  /** The run (batch) it belongs to. */
  run: RunIdSchema.optional(),
  /**
   * Assessments in the evidence ledger that back it: `e12` (this article's
   * `content/evidence/aNNNN.json`) or `a0042/e12`.
   */
  evidence: z.array(z.string().regex(/^(?:a\d{4,}\/)?e\d+$/)).optional(),
  /** How sure the author was of the change. */
  confidence: ConfidenceSchema.optional(),
  /** The member report (`quiz_reports` id) it answers. */
  report: z.string().min(1).optional(),
  /**
   * sha256(previous chained entry's chain + this entry without `chain`)
   * (`entryChain`), making the file a tamper-evident hash chain.
   */
  chain: ChainSchema.optional(),
  /** Where the entry was first written, when a move carried it to this file. */
  movedFrom: z.object({ article: ArticleIdSchema, seq: z.number().int().positive() }).optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const ArticleHistorySchema = z.object({
  article: ArticleIdSchema,
  entries: z.array(HistoryEntrySchema),
});
export type ArticleHistory = z.infer<typeof ArticleHistorySchema>;

/** `history/cards/<source>.json`: the history of a source's printed cards (target type `card`). */
export const CardHistorySchema = z.object({
  source: SourceIdSchema,
  entries: z.array(HistoryEntrySchema),
});
export type CardHistory = z.infer<typeof CardHistorySchema>;
