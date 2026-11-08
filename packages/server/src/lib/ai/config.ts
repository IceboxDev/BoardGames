import { aiSuspended } from "../ai-suspend";
import { AiConfigError } from "./errors";
import {
  type AiRole,
  activeProfile,
  type ModelRef,
  parseModelId,
  providerKey,
  roleModel,
} from "./models";

// Model/transport resolution for every AI-backed feature. A feature names a
// role (models.ts); env vars can pin a feature to any model string — a
// registry id (`anthropic:claude-opus-5-5`) or a legacy gateway slug
// (`openai/gpt-5.2`, read as `gateway:openai/gpt-5.2`).
//
// The gateway profile (the default) runs on the Vercel AI Gateway free tier:
// $5/month of credits on the "Free Tier" model subset under tighter rate
// limits; excluded models 403 and both cases map to AiBudgetError.

export type AiFeature =
  | "codenames"
  | "decrypto"
  | "dnd"
  | "dnd-extract"
  | "avatar"
  | "descriptions"
  | "skills"
  | "probe"
  | "agent";

export type AiTransportId = "sync" | "stream" | "openai-background";

/** The role each feature runs at when nothing pins it. Game features pass their tier's model. */
const FEATURE_ROLES: Record<AiFeature, AiRole> = {
  codenames: "smart",
  decrypto: "smart",
  dnd: "smart",
  "dnd-extract": "smart",
  avatar: "image",
  descriptions: "smart",
  skills: "smart",
  probe: "fast",
  agent: "smart",
};

const MODEL_ENV: Partial<Record<AiFeature, string>> = {
  dnd: "AI_MODEL_DND",
  "dnd-extract": "AI_MODEL_DND_EXTRACT",
  avatar: "AI_MODEL_AVATAR",
  descriptions: "AI_MODEL_DESCRIPTIONS",
  skills: "AI_MODEL_SKILLS",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** A feature's explicit model pin (its own env var, else AI_MODEL for text features). */
export function featureModelPin(feature: AiFeature): string | undefined {
  const featureVar = MODEL_ENV[feature];
  const pinned = featureVar ? env(featureVar) : undefined;
  if (pinned) return pinned;
  // Avatar must stay on an image-output model — never the global text pin.
  return feature === "avatar" ? undefined : env("AI_MODEL");
}

/** A role's model in the active profile; throws when the profile has none. */
export function modelForRole(role: AiRole): ModelRef {
  const ref = roleModel(role);
  if (!ref) {
    throw new AiConfigError(`The "${activeProfile()}" AI profile has no ${role} model.`);
  }
  return ref;
}

/**
 * A game tier's model: its env pin (`CODENAMES_MODEL_EXPERT`, …) or the
 * role's model in the active profile. Returns the registry id.
 */
export function tierModel(envVar: string, role: AiRole): string {
  const pinned = env(envVar);
  return pinned ? parseModelId(pinned).id : modelForRole(role).id;
}

/** override → feature pin → AI_MODEL → the feature's role in the active profile. */
export function resolveModel(feature: AiFeature, override?: string): ModelRef {
  const pinned = override ?? featureModelPin(feature);
  return pinned ? parseModelId(pinned) : modelForRole(FEATURE_ROLES[feature]);
}

const TRANSPORTS: readonly AiTransportId[] = ["sync", "stream", "openai-background"];

function parseTransport(raw: string | undefined): AiTransportId | undefined {
  return TRANSPORTS.find((t) => t === raw);
}

export function resolveTransport(feature: AiFeature): AiTransportId {
  const featureVar = `AI_TRANSPORT_${feature.toUpperCase().replaceAll("-", "_")}`;
  return parseTransport(env(featureVar)) ?? parseTransport(env("AI_TRANSPORT")) ?? "stream";
}

/** Optional comma list of gateway fallback models (providerOptions.gateway.models). */
export function resolveFallbackModels(): string[] | undefined {
  const raw = env("AI_MODEL_FALLBACKS");
  if (!raw) return undefined;
  const models = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return models.length > 0 ? models : undefined;
}

/**
 * Stream idle guards, mapped to streamText's timeout object: firstChunkMs is
 * the wait for the first content-bearing chunk (covers thinking-silent
 * stretches before output), chunkMs the max gap between chunks after that.
 */
export function resolveStreamIdleTimeoutMs(): number {
  const raw = Number(env("AI_STREAM_IDLE_TIMEOUT_MS"));
  return Number.isFinite(raw) && raw > 0 ? raw : 90_000;
}

export function openAiKey(): string | undefined {
  return providerKey("openai");
}

/**
 * True when the active profile's text models can run: not suspended and the
 * profile's provider has its key. (Each call still checks the key of the
 * model it actually resolves to.)
 */
export function aiAvailable(): boolean {
  if (aiSuspended()) return false;
  try {
    return Boolean(providerKey(modelForRole("smart").provider));
  } catch {
    return false;
  }
}
