import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { DECRYPTO_AI_MODELS, DEFAULT_DECRYPTO_MODEL } from "./ai/models";

export const DecryptoConfigSchema = z.object({
  /** A 30-second limit on writing clues. */
  timerEnabled: z.boolean().default(false),
});
export type DecryptoConfig = z.infer<typeof DecryptoConfigSchema>;

// Four seats are two teams (0–1 White, 2–3 Black). Three seats are the
// official Interceptor variant: seats 0–1 transmit, seat 2 intercepts.
export const decryptoManifest = defineManifest({
  slug: "decrypto",
  seats: { min: 3, max: 4 },
  seatNames: ["White 1", "White 2", "Black 1", "Black 2"],
  strategies: DECRYPTO_AI_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    difficulty: m.difficulty,
  })),
  defaultStrategy: DEFAULT_DECRYPTO_MODEL,
  config: DecryptoConfigSchema,
});
