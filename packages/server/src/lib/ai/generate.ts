import type { JSONValue } from "ai";
import { gateway, generateText } from "ai";
import { aiSuspended } from "../ai-suspend";
import type { AiFeature, AiTransportId } from "./config";
import { gatewayKey, resolveFallbackModels, resolveModel, resolveTransport } from "./config";
import { AiConfigError, causeChain, suspendedError } from "./errors";
import { withTransientRetry } from "./retry";
import { openAiBackgroundTransport } from "./transports/openai-background";
import { streamTransport } from "./transports/stream";
import { syncTransport } from "./transports/sync";
import type { AiTransport, AiUserContent } from "./transports/types";

export interface StructuredGenerateArgs {
  feature: AiFeature;
  /** Log prefix, e.g. "decrypto" or "dnd". */
  label: string;
  system?: string;
  user: AiUserContent;
  schemaName: string;
  /** Strict JSON Schema (additionalProperties: false, all properties required). */
  jsonSchema: Record<string, unknown>;
  /** Total budget for the call, ms. */
  budgetMs: number;
  reasoningEffort?: "low" | "medium" | "high";
  /** Overrides env model resolution (Decrypto passes the resolved seat slug). */
  modelOverride?: string;
}

const TRANSPORTS: Record<AiTransportId, AiTransport> = {
  sync: syncTransport,
  stream: streamTransport,
  "openai-background": openAiBackgroundTransport,
};

let transportOverrides: Partial<Record<AiTransportId, AiTransport>> | null = null;

/** Test seam: replace transports (pass null to restore the real ones). */
export function setAiTransportsForTests(
  overrides: Partial<Record<AiTransportId, AiTransport>> | null,
): void {
  transportOverrides = overrides;
}

function gatewayOptions(feature: AiFeature): Record<string, JSONValue> {
  const fallbacks = resolveFallbackModels();
  return {
    tags: [`feature:${feature}`],
    ...(fallbacks ? { models: fallbacks } : {}),
  };
}

/**
 * The one chokepoint every structured server-side AI call goes through.
 * Returns the parsed schema-shaped object; callers re-validate with zod.
 * Throws AiConfigError (suspended / unkeyed / budget exhausted) or the
 * underlying provider error — callers own their fallback.
 */
export async function structuredGenerate(args: StructuredGenerateArgs): Promise<unknown> {
  if (aiSuspended()) throw suspendedError();
  const transportId = resolveTransport(args.feature);
  const transport = transportOverrides?.[transportId] ?? TRANSPORTS[transportId];
  if (transportId !== "openai-background" && !gatewayKey()) {
    throw new AiConfigError("AI is not configured (AI_GATEWAY_API_KEY).");
  }
  const request = {
    model: resolveModel(args.feature, args.modelOverride),
    label: args.label,
    system: args.system,
    user: args.user,
    schemaName: args.schemaName,
    jsonSchema: args.jsonSchema,
    budgetMs: args.budgetMs,
    reasoningEffort: args.reasoningEffort,
    gatewayOptions: gatewayOptions(args.feature),
  };
  // The background transport retries its own individual HTTP calls — an outer
  // retry would restart the whole (possibly minutes-long) background job.
  if (transportId === "openai-background") return transport(request);
  return withTransientRetry(args.label, () => transport(request));
}

/**
 * Reachability probe for `/api/health/ai`. Plain mode is an unbilled gateway
 * metadata call; `gen: true` runs a real one-word generation through the
 * configured transport path (admin-gated at the route — it bills).
 */
export async function probeAi(
  gen: boolean,
): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const t0 = Date.now();
  try {
    if (aiSuspended()) throw suspendedError();
    if (!gen) {
      const available = await gateway.getAvailableModels();
      return {
        ok: true,
        detail: `gateway models ok (${available.models.length} models, ${Date.now() - t0}ms)`,
      };
    }
    const result = await generateText({
      model: resolveModel("probe"),
      prompt: "Reply with exactly: OK",
      timeout: { totalMs: 60_000 },
      providerOptions: { gateway: gatewayOptions("probe") },
    });
    const text = result.text.slice(0, 40);
    return { ok: true, detail: `generation ok (${Date.now() - t0}ms): ${text}` };
  } catch (err) {
    return { ok: false, error: causeChain(err) };
  }
}
