/**
 * The selectable GPT models for Decrypto AI seats. A seat's chosen id rides
 * as its strategy string (solo config + room slot `aiStrategy`) and is passed
 * verbatim as the OpenAI `model` parameter by the server agent, so adding or
 * swapping a model is a one-line edit here.
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
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Fast and cheap. Gives serviceable clues but misses subtle associations.",
    difficulty: "Medium",
  },
  {
    id: "gpt-5.1",
    label: "GPT-5.1",
    description: "A solid all-rounder — coherent clues and decent pattern-matching on yours.",
    difficulty: "Hard",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    description: "The strongest agent. Oblique clues for its team, ruthless interception on yours.",
    difficulty: "Expert",
  },
] as const;

export const DEFAULT_DECRYPTO_MODEL = "gpt-5.5";

export function isKnownDecryptoModel(id: string): boolean {
  return DECRYPTO_AI_MODELS.some((m) => m.id === id);
}
