import type { JSONValue } from "ai";
import { gateway, generateText } from "ai";
import { aiSuspended } from "../ai-suspend";
import type { AiFeature, AiTransportId } from "./config";
import { gatewayKey, resolveFallbackModels, resolveModel, resolveTransport } from "./config";
import { AiConfigError, causeChain, suspendedError } from "./errors";
import {
  type AiCallRecord,
  type AiCallUsage,
  EMPTY_USAGE,
  newAiCallId,
  recordAiCall,
  sumUsage,
} from "./ledger";
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

function userText(user: AiUserContent): string {
  if (typeof user === "string") return user;
  return user
    .map((part) => (part.type === "text" ? part.text : `[file ${part.filename ?? part.mediaType}]`))
    .join("\n");
}

/** A structured call's answer and its ledger record (id, tokens, billed cost). */
export interface TracedGeneration {
  output: unknown;
  call: AiCallRecord;
}

/**
 * The one chokepoint every structured server-side AI call goes through.
 * Returns the parsed schema-shaped object; callers re-validate with zod.
 * Throws AiConfigError (suspended / unkeyed / budget exhausted) or the
 * underlying provider error — callers own their fallback.
 */
export async function structuredGenerate(args: StructuredGenerateArgs): Promise<unknown> {
  return (await structuredGenerateTraced(args)).output;
}

/**
 * `structuredGenerate`, also returning the call's ledger record — for
 * callers that keep cost or trace ids with what the answer became (a
 * Codenames clue's note). Every call is recorded either way (`ledger.ts`).
 */
export async function structuredGenerateTraced(
  args: StructuredGenerateArgs,
): Promise<TracedGeneration> {
  if (aiSuspended()) throw suspendedError();
  const transportId = resolveTransport(args.feature);
  const transport = transportOverrides?.[transportId] ?? TRANSPORTS[transportId];
  if (transportId !== "openai-background" && !gatewayKey()) {
    throw new AiConfigError("AI is not configured (AI_GATEWAY_API_KEY).");
  }
  const model = resolveModel(args.feature, args.modelOverride);
  let usage: AiCallUsage = EMPTY_USAGE;
  let attempts = 0;
  const request = {
    model,
    label: args.label,
    system: args.system,
    user: args.user,
    schemaName: args.schemaName,
    jsonSchema: args.jsonSchema,
    budgetMs: args.budgetMs,
    reasoningEffort: args.reasoningEffort,
    gatewayOptions: gatewayOptions(args.feature),
    onUsage: (u: AiCallUsage) => {
      usage = sumUsage(usage, u);
    },
  };
  const started = Date.now();
  const record = (ok: boolean, output: unknown, error: string | null): AiCallRecord => {
    const call: AiCallRecord = {
      id: newAiCallId(),
      at: new Date(started).toISOString(),
      feature: args.feature,
      label: args.label,
      model: typeof model === "string" ? model : "(model instance)",
      transport: transportId,
      ms: Date.now() - started,
      ok,
      error,
      usage,
      attempts,
      system: args.system ?? null,
      user: userText(args.user),
      output,
    };
    recordAiCall(call);
    return call;
  };
  const attempt = () => {
    attempts++;
    return transport(request);
  };
  try {
    // The background transport retries its own individual HTTP calls — an outer
    // retry would restart the whole (possibly minutes-long) background job.
    const output =
      transportId === "openai-background"
        ? await attempt()
        : await withTransientRetry(args.label, attempt);
    return { output, call: record(true, output, null) };
  } catch (err) {
    record(false, null, causeChain(err));
    throw err;
  }
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
