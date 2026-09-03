import { aiSuspended } from "../ai-suspend";

// Model/transport resolution for every AI-backed feature. This is the single
// place the old scattered `?? "gpt-5.5"` defaults collapsed into. Model ids
// are Vercel AI Gateway slugs ("provider/model", dots for versions); defaults
// were pinned from https://ai-gateway.vercel.sh/v1/models on 2026-09-02.
//
// The account runs on the gateway FREE TIER: $5/month of free credits,
// usable on the dashboard's "Free Tier" model subset (most OpenAI models,
// some others) under tighter rate limits; excluded models 403 and both
// cases map to AiBudgetError. Defaults mirror the pre-migration OpenAI
// setup; hopping provider or tier later is just an env override.

export type AiFeature =
  | "decrypto"
  | "dnd"
  | "dnd-extract"
  | "avatar"
  | "descriptions"
  | "skills"
  | "probe";

export type AiTransportId = "sync" | "stream" | "openai-background";

const GLOBAL_DEFAULT_MODEL = "openai/gpt-5.2";

/** Per-feature fallbacks when neither the feature var nor AI_MODEL is set. */
const DEFAULT_MODELS: Record<AiFeature, string> = {
  decrypto: GLOBAL_DEFAULT_MODEL,
  // Everything text runs the strongest flagship on the gateway free tier
  // (PDF-capable), like the single OPENAI_MODEL flagship pre-migration.
  dnd: GLOBAL_DEFAULT_MODEL,
  "dnd-extract": GLOBAL_DEFAULT_MODEL,
  // Image-output model; deliberately NOT falling back to AI_MODEL (text-only).
  // AI_MODEL_AVATAR=openai-image-tool selects the legacy direct-OpenAI path.
  avatar: "google/gemini-3.1-flash-image",
  // Runs with OpenAI's hosted web_search tool (see scripts/gen-descriptions).
  descriptions: GLOBAL_DEFAULT_MODEL,
  skills: GLOBAL_DEFAULT_MODEL,
  probe: GLOBAL_DEFAULT_MODEL,
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

export function resolveModel(feature: AiFeature, override?: string): string {
  if (override) return override;
  const featureVar = MODEL_ENV[feature];
  const featureModel = featureVar ? env(featureVar) : undefined;
  if (featureModel) return featureModel;
  // Avatar must stay on an image-output model — never the global text default.
  if (feature === "avatar") return DEFAULT_MODELS.avatar;
  return env("AI_MODEL") ?? DEFAULT_MODELS[feature];
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

export function gatewayKey(): string | undefined {
  return env("AI_GATEWAY_API_KEY");
}

export function openAiKey(): string | undefined {
  return env("OPENAI_API_KEY");
}

/** True when at least one AI path can run (gateway, or the OpenAI escape hatch). */
export function aiAvailable(): boolean {
  return !aiSuspended() && Boolean(gatewayKey() ?? openAiKey());
}
