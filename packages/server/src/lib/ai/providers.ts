import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { Instructions, JSONValue, LanguageModelUsage, ProviderMetadata, ToolSet } from "ai";
import { resolveFallbackModels } from "./config";
import type { AiCallUsage } from "./ledger";
import type { AiProviderId, ModelRef } from "./models";
import { listPriceCost } from "./pricing";

// ── What differs between providers, in one place ───────────────────────────
//
// Everything else — prompts, schemas, the unified `reasoning` setting (the AI
// SDK maps it to each provider's own: Anthropic's adaptive thinking + effort,
// OpenAI's reasoning effort), retries, the ledger — is shared. A provider
// adds: its request options, how its system prompt is sent, and how its usage
// turns into the ledger's tokens and dollars.

export type ProviderOptions = Record<string, Record<string, JSONValue>>;

export interface CallContext {
  feature: string;
}

interface ProviderAdapter {
  /** Extra `providerOptions` for a call (undefined = none). */
  providerOptions(ctx: CallContext): ProviderOptions | undefined;
  /** The system prompt as this provider should receive it. */
  instructions(system: string): Instructions;
  /** Gateway-reported facts (billed cost, the model that answered, generation id). */
  billing(metadata: ProviderMetadata | undefined): {
    costUsd: number | null;
    resolvedModel: string | null;
    generationId: string | null;
  };
}

const NO_BILLING = { costUsd: null, resolvedModel: null, generationId: null };

const gatewayAdapter: ProviderAdapter = {
  providerOptions(ctx) {
    const fallbacks = resolveFallbackModels();
    return {
      gateway: { tags: [`feature:${ctx.feature}`], ...(fallbacks ? { models: fallbacks } : {}) },
    };
  },
  instructions: (system) => system,
  billing(metadata) {
    const gateway = metadata?.gateway;
    if (!gateway) return NO_BILLING;
    const cost = typeof gateway.cost === "string" ? Number(gateway.cost) : Number.NaN;
    const routing = gateway.routing;
    const slug =
      routing &&
      typeof routing === "object" &&
      !Array.isArray(routing) &&
      "canonicalSlug" in routing
        ? routing.canonicalSlug
        : null;
    return {
      costUsd: Number.isFinite(cost) ? cost : null,
      resolvedModel: typeof slug === "string" ? slug : null,
      generationId: typeof gateway.generationId === "string" ? gateway.generationId : null,
    };
  },
};

const anthropicAdapter: ProviderAdapter = {
  providerOptions: () => undefined,
  // The system prompt is the stable prefix of every call of a feature, so it
  // is marked for Anthropic's prompt cache (a prefix under the model's
  // minimum just doesn't cache — no error, no charge).
  instructions: (system) => ({
    role: "system",
    content: system,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  }),
  billing: () => NO_BILLING,
};

const openAiAdapter: ProviderAdapter = {
  providerOptions: () => undefined,
  instructions: (system) => system,
  billing: () => NO_BILLING,
};

const ADAPTERS: Record<AiProviderId, ProviderAdapter> = {
  gateway: gatewayAdapter,
  anthropic: anthropicAdapter,
  openai: openAiAdapter,
};

export function adapterFor(ref: ModelRef): ProviderAdapter {
  return ADAPTERS[ref.provider];
}

/**
 * The provider's own hosted web search, as a tool set, or null when the model
 * has none (the caller must then fail loudly — a "researched" answer written
 * without search is worse than none). On the gateway only OpenAI models get
 * OpenAI's tool.
 */
export function webSearchTools(ref: ModelRef, maxUses = 8): ToolSet | null {
  if (ref.provider === "anthropic") {
    return { web_search: anthropic.tools.webSearch_20260209({ maxUses }) };
  }
  if (ref.provider === "openai" || ref.model.startsWith("openai/")) {
    return { web_search: openai.tools.webSearch() };
  }
  return null;
}

/** One finished call's tokens and dollars, as the ledger keeps them. */
export function readUsage(
  ref: ModelRef,
  usage: LanguageModelUsage | undefined,
  metadata: ProviderMetadata | undefined,
): AiCallUsage {
  const billed = adapterFor(ref).billing(metadata);
  const listed = billed.costUsd === null ? listPriceCost(ref, usage) : null;
  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? null,
    cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? null,
    costUsd: billed.costUsd ?? listed,
    costSource: billed.costUsd !== null ? "billed" : listed !== null ? "list" : null,
    resolvedModel: billed.resolvedModel,
    generationId: billed.generationId,
  };
}
