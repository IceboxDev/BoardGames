// Kill switch for every AI-backed feature: Decrypto LLM agents, D&D
// extraction/referee calls, avatar image generation, the /api/health/ai
// probe, and the gen-descriptions / gen-skills scripts (which read the same
// env file). Set AI_SUSPENDED=1 to stop all billed AI calls without
// unsetting any keys — AI game seats drop to their deterministic fallbacks
// and the billed HTTP routes return 503 NOT_CONFIGURED.
export function aiSuspended(): boolean {
  return /^(1|true|yes)$/i.test(process.env.AI_SUSPENDED ?? "");
}

export const AI_SUSPENDED_MESSAGE = "AI features are temporarily suspended (AI_SUSPENDED is set).";
