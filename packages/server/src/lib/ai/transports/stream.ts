import { jsonSchema, Output, streamText } from "ai";
import { resolveStreamIdleTimeoutMs } from "../config";
import type { AiTransportRequest } from "./types";
import { toUserMessages } from "./types";

/**
 * Streaming transport — the server default. Reasoning/text deltas keep bytes
 * flowing so Railway's egress path doesn't sever the connection the way it
 * does quiet long-lived requests ("Premature close"). The idle guard maps to
 * streamText's own timeout object: firstChunkMs bounds the wait for the first
 * content-bearing chunk, chunkMs the gap between chunks after that; a trip
 * surfaces as a timeout error that withTransientRetry treats as transient.
 */
export async function streamTransport(req: AiTransportRequest): Promise<unknown> {
  const idleMs = resolveStreamIdleTimeoutMs();
  let streamError: unknown;
  const result = streamText({
    model: req.model,
    ...(req.system ? { instructions: req.system } : {}),
    messages: toUserMessages(req.user),
    output: Output.object({ schema: jsonSchema(req.jsonSchema), name: req.schemaName }),
    ...(req.reasoningEffort ? { reasoning: req.reasoningEffort } : {}),
    maxRetries: 0, // retries live in withTransientRetry, one layer up
    timeout: { totalMs: req.budgetMs, firstChunkMs: idleMs, chunkMs: idleMs },
    ...(req.gatewayOptions ? { providerOptions: { gateway: req.gatewayOptions } } : {}),
    onError: ({ error }) => {
      streamError ??= error;
    },
  });
  await result.consumeStream({
    onError: (error) => {
      streamError ??= error;
    },
  });
  if (streamError !== undefined) {
    throw streamError instanceof Error ? streamError : new Error(String(streamError));
  }
  return await result.output;
}
