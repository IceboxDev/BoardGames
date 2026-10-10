/**
 * The AI tiers for Codenames and Duet seats. A seat's id rides as its
 * strategy string; the server agent maps the tier to a concrete model
 * (env-configurable gateway slug), so ids stay provider-neutral on the wire
 * and in persisted rooms and match history — the same seam as Decrypto.
 */
import type { StrategyInfo } from "../../../machines/manifest";

export const CODENAMES_AI_MODELS = [
  {
    id: "codenames-medium",
    label: "Scout",
    description: "Fast and cheap. Safe one- and two-word clues; guesses only what it is sure of.",
    difficulty: "Medium",
  },
  {
    id: "codenames-hard",
    label: "Analyst",
    description: "A solid partner — links two or three words and steers clear of the assassin.",
    difficulty: "Hard",
  },
  {
    id: "codenames-expert",
    label: "Mastermind",
    description: "The strongest agent. Ambitious multi-word clues and sharp guessing.",
    difficulty: "Expert",
  },
] as const satisfies readonly StrategyInfo[];

export type CodenamesAiModel = (typeof CODENAMES_AI_MODELS)[number]["id"];

export const DEFAULT_CODENAMES_MODEL: CodenamesAiModel = "codenames-expert";

export function isCodenamesModel(id: string): id is CodenamesAiModel {
  return CODENAMES_AI_MODELS.some((m) => m.id === id);
}

/** Any stored strategy string as a tier; unknown ids play at the default tier. */
export function codenamesModelOf(id: string | null | undefined): CodenamesAiModel {
  return id && isCodenamesModel(id) ? id : DEFAULT_CODENAMES_MODEL;
}
