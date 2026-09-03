/**
 * The selectable AI difficulty tiers for Decrypto AI seats. A seat's chosen id
 * rides as its strategy string (solo config + room slot `aiStrategy`); the
 * server agent maps the tier to a concrete provider model (env-configurable
 * gateway slug), so ids stay provider-neutral on the wire and in persisted
 * room state / match history.
 *
 * `difficulty` matches the web setup screen's shared DifficultyTier vocabulary
 * ("Easy" | "Medium" | "Hard" | "Hard+" | "Expert").
 */
export interface DecryptoAiModel {
  id: string;
  label: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard" | "Hard+" | "Expert";
}

export const DECRYPTO_AI_MODELS: readonly DecryptoAiModel[] = [
  {
    id: "decrypto-medium",
    label: "Scout",
    description: "Fast and cheap. Gives serviceable clues but misses subtle associations.",
    difficulty: "Medium",
  },
  {
    id: "decrypto-hard",
    label: "Analyst",
    description: "A solid all-rounder — coherent clues and decent pattern-matching on yours.",
    difficulty: "Hard",
  },
  {
    id: "decrypto-expert",
    label: "Mastermind",
    description: "The strongest agent. Oblique clues for its team, ruthless interception on yours.",
    difficulty: "Expert",
  },
] as const;

export const DEFAULT_DECRYPTO_MODEL = "decrypto-expert";

/**
 * Pre-migration seats stored raw OpenAI model ids as their strategy strings;
 * they live on in room state and match-history rows, so map them to tiers
 * forever instead of breaking old data.
 */
export const LEGACY_DECRYPTO_MODEL_IDS: Record<string, string> = {
  "gpt-5-mini": "decrypto-medium",
  "gpt-5.1": "decrypto-hard",
  "gpt-5.5": "decrypto-expert",
};

export function canonicalDecryptoModel(id: string): string {
  return LEGACY_DECRYPTO_MODEL_IDS[id] ?? id;
}

export function isKnownDecryptoModel(id: string): boolean {
  const canonical = canonicalDecryptoModel(id);
  return DECRYPTO_AI_MODELS.some((m) => m.id === canonical);
}
