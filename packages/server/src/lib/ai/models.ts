import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry, gateway, type LanguageModel } from "ai";
import { AiConfigError } from "./errors";

// ── Which model answers: roles, profiles, one registry ─────────────────────
//
// Features never name a model. They name a ROLE (how strong and how fast the
// answer has to be); the active PROFILE (`AI_PROFILE`) maps each role to a
// registry id `<provider>:<model>`; the registry turns that id into an AI SDK
// model. Moving the whole site to another provider is one env var, and adding
// a provider is an entry in PROVIDERS + a profile (+ price rows in
// pricing.ts) — docs/ai-architecture.md.
//
// A bare `vendor/model` string — every model env var written before profiles
// existed, e.g. CODENAMES_MODEL_EXPERT=openai/gpt-5.2 — is a gateway slug and
// resolves as `gateway:vendor/model`.

export type AiRole = "fast" | "balanced" | "smart" | "image";
export type AiProviderId = "gateway" | "anthropic" | "openai";
export type AiProfileId = AiProviderId;

/** The env var that holds each provider's key. */
export const PROVIDER_KEY_ENV: Record<AiProviderId, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * Role → registry id, per profile. `null` = the profile has no such model
 * (Claude has no image output): the feature reports itself unavailable.
 * The gateway profile is the pre-profile setup, model for model.
 */
export const PROFILES: Record<AiProfileId, Record<AiRole, string | null>> = {
  gateway: {
    fast: "gateway:openai/gpt-5-nano",
    balanced: "gateway:openai/gpt-5.4-nano",
    smart: "gateway:openai/gpt-5.2",
    image: "gateway:google/gemini-3.1-flash-image",
  },
  anthropic: {
    fast: "anthropic:claude-haiku-5-5",
    balanced: "anthropic:claude-sonnet-5-5",
    smart: "anthropic:claude-opus-5-5",
    image: null,
  },
  openai: {
    fast: "openai:gpt-5-nano",
    balanced: "openai:gpt-5.4-nano",
    smart: "openai:gpt-5.2",
    image: null,
  },
};

/** When the active profile has no image model, the gateway's is used if its key is set. */
const IMAGE_FALLBACK = PROFILES.gateway.image;

const PROVIDER_IDS = Object.keys(PROVIDER_KEY_ENV) as AiProviderId[];

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isProviderId(value: string): value is AiProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

export function activeProfile(): AiProfileId {
  const raw = env("AI_PROFILE");
  if (raw === undefined) return "gateway";
  if (isProviderId(raw)) return raw;
  throw new AiConfigError(`Unknown AI_PROFILE "${raw}" (expected ${PROVIDER_IDS.join(", ")}).`);
}

export function providerKey(provider: AiProviderId): string | undefined {
  return env(PROVIDER_KEY_ENV[provider]);
}

export interface ModelRef {
  /** Registry id, `<provider>:<model>` — what the ledger records. */
  id: string;
  provider: AiProviderId;
  /** The provider's own model id (`claude-opus-5-5`, `openai/gpt-5.2` on the gateway). */
  model: string;
}

/** Any model string (registry id or legacy bare gateway slug) → its parts. */
export function parseModelId(raw: string): ModelRef {
  const colon = raw.indexOf(":");
  const prefix = colon === -1 ? "" : raw.slice(0, colon);
  if (isProviderId(prefix)) {
    return { id: raw, provider: prefix, model: raw.slice(colon + 1) };
  }
  return { id: `gateway:${raw}`, provider: "gateway", model: raw };
}

/** The active profile's model for a role, or null when it has none. */
export function roleModel(role: AiRole): ModelRef | null {
  const id = PROFILES[activeProfile()][role];
  if (id) return parseModelId(id);
  if (role === "image" && IMAGE_FALLBACK && providerKey("gateway")) {
    return parseModelId(IMAGE_FALLBACK);
  }
  return null;
}

/**
 * Providers read their key at request time, so the registry is built once.
 * Each is created with our env var names, so a missing key fails as our own
 * AiConfigError (`requireKey`) before any request leaves.
 */
const registry = createProviderRegistry({
  gateway,
  anthropic: createAnthropic(),
  openai: createOpenAI(),
});

export function requireKey(ref: ModelRef): void {
  if (!providerKey(ref.provider)) {
    throw new AiConfigError(
      `AI is not configured for ${ref.provider} (${PROVIDER_KEY_ENV[ref.provider]}).`,
    );
  }
}

/** The AI SDK model for a registry id. */
export function languageModel(ref: ModelRef): LanguageModel {
  return registry.languageModel(`${ref.provider}:${ref.model}`);
}
