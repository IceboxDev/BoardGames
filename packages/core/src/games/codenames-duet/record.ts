/** The saved replay of a finished Duet game — both key sides included. */
import { z } from "zod";
import { ClueSchema } from "../codenames/clue-rules";
import { AiCostSchema, ClueNoteSchema, GuessNoteSchema } from "../codenames/notes";
import { LanguageSchema } from "../codenames/words";

const SideSchema = z.union([z.literal(0), z.literal(1)]);
const EntrySchema = z.enum(["agent", "bystander", "assassin"]);

export const DuetReplayLogSchema = z.object({
  formatVersion: z.literal(1),
  seed: z.number(),
  language: LanguageSchema,
  ai: z.tuple([z.string().nullable(), z.string().nullable()]),
  words: z.array(z.string()).length(25),
  key: z.array(z.tuple([EntrySchema, EntrySchema])).length(25),
  tokensTotal: z.number().int(),
  turns: z.array(
    z.object({
      giver: SideSchema.nullable(),
      clue: ClueSchema.nullable(),
      guesses: z.array(z.object({ card: z.number().int(), by: SideSchema, result: EntrySchema })),
      end: z
        .enum(["bystander", "stopped", "assassin", "won", "clue-timeout", "guess-timeout"])
        .nullable(),
      note: ClueNoteSchema.optional(),
      guessNotes: z.array(GuessNoteSchema).optional(),
    }),
  ),
  result: z.object({
    won: z.boolean(),
    reason: z.enum(["all-found", "assassin", "sudden-death"]),
    agentsFound: z.number().int(),
    tokensLeft: z.number().int(),
  }),
  aiCost: AiCostSchema.optional(),
});
export type DuetReplayLog = z.infer<typeof DuetReplayLogSchema>;
