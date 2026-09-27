import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { QUIZTOPIA_DECKS } from "./types";

export const QuiztopiaConfigSchema = z.object({
  difficulty: z.number().int().min(0).max(3).default(0),
  /** Expert mode (tip cards); the engine forces it off at one player. */
  expert: z.boolean().default(false),
  deck: z.enum(QUIZTOPIA_DECKS).default("original"),
  /** The room's question language; absent = both, each reader picks. */
  language: z.enum(["en", "de"]).optional(),
});
export type QuiztopiaConfig = z.infer<typeof QuiztopiaConfigSchema>;

// Co-operative quiz for 1–6 people; the app is the referee, there is no AI.
export const quiztopiaManifest = defineManifest({
  slug: "quiztopia",
  seats: { min: 1, max: 6 },
  strategies: [],
  config: QuiztopiaConfigSchema,
});
