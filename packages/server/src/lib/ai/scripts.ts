import type { Instructions, LanguageModel, ToolSet } from "ai";
import { aiSuspended } from "../ai-suspend";
import { type AiFeature, resolveModel } from "./config";
import { languageModel, type ModelRef, requireKey } from "./models";
import { adapterFor, type ProviderOptions, webSearchTools } from "./providers";

// ── The local generation scripts' view of the AI platform ──────────────────
//
// scripts/gen-descriptions and scripts/gen-skills run under tsx and import
// this, so they resolve models through the same profiles and registry as the
// server (AI_PROFILE, AI_MODEL_DESCRIPTIONS / AI_MODEL_SKILLS, AI_MODEL).

export interface ScriptModel {
  ref: ModelRef;
  model: LanguageModel;
  /** Spread into generateText: the provider's options and system-prompt shape. */
  callOptions(system: string): { instructions: Instructions; providerOptions?: ProviderOptions };
  /** The provider's hosted web search, or null when it has none. */
  webSearch(): ToolSet | null;
}

/** Throws a plain Error (with the reason) when the script must not run. */
export function scriptModel(feature: AiFeature): ScriptModel {
  if (aiSuspended())
    throw new Error("AI_SUSPENDED is set (packages/server/.env) — AI usage is suspended.");
  const ref = resolveModel(feature);
  requireKey(ref);
  const adapter = adapterFor(ref);
  return {
    ref,
    model: languageModel(ref),
    callOptions(system) {
      const providerOptions = adapter.providerOptions({ feature });
      return {
        instructions: adapter.instructions(system),
        ...(providerOptions ? { providerOptions } : {}),
      };
    },
    webSearch: () => webSearchTools(ref),
  };
}
