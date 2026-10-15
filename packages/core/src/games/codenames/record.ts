/**
 * The saved replay of a finished game: everything to redraw the board turn by
 * turn, key included (it is only written at game over).
 */
import { z } from "zod";
import { ClueSchema } from "./clue-rules";
import { AiCostSchema, ClueNoteSchema, GuessNoteSchema } from "./notes";
import { LanguageSchema } from "./words";

const TeamSchema = z.union([z.literal(0), z.literal(1)]);
export const KeyEntrySchema = z.union([TeamSchema, z.literal("bystander"), z.literal("assassin")]);

export const TurnRecordSchema = z.object({
  team: TeamSchema,
  clue: ClueSchema.nullable(),
  guesses: z.array(
    z.object({ card: z.number().int(), by: z.number().int(), result: KeyEntrySchema }),
  ),
  end: z
    .enum(["miss", "limit", "stopped", "assassin", "won", "clue-timeout", "guess-timeout"])
    .nullable(),
  // Optional: games saved before notes existed have none.
  note: ClueNoteSchema.optional(),
  guessNotes: z.array(GuessNoteSchema).optional(),
  // Optional: the clue questions this turn (absent before they existed, or when none were asked).
  appeals: z
    .array(
      z.object({
        word: z.string().max(30),
        clash: z.string().max(60),
        by: z.number().int(),
        judge: z.number().int(),
        ruling: z.enum(["allowed", "refused", "unanswered", "withdrawn"]),
        reason: z.string().max(600).nullable(),
        cost: AiCostSchema.optional(),
      }),
    )
    .optional(),
});

export const CodenamesReplayLogSchema = z.object({
  formatVersion: z.literal(1),
  seed: z.number(),
  language: LanguageSchema,
  seatCount: z.number().int(),
  ai: z.array(z.string().nullable()),
  words: z.array(z.string()).length(25),
  key: z.array(KeyEntrySchema).length(25),
  startingTeam: TeamSchema,
  turns: z.array(TurnRecordSchema),
  result: z.object({
    winner: TeamSchema,
    reason: z.enum(["agents", "assassin"]),
    agentsFound: z.tuple([z.number().int(), z.number().int()]),
  }),
  /** What the game's AI calls cost (debugging; absent in older games). */
  aiCost: AiCostSchema.optional(),
});
export type CodenamesReplayLog = z.infer<typeof CodenamesReplayLogSchema>;
