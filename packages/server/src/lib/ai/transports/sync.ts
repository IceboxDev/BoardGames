import { generateText, jsonSchema, Output } from "ai";
import type { AiTransportRequest } from "./types";
import { toUserMessages } from "./types";

/**
 * Plain awaited call. Fine for local scripts and short generations; on
 * Railway prefer the stream transport — a quiet long-lived connection gets
 * severed by the egress path ("Premature close").
 */
export async function syncTransport(req: AiTransportRequest): Promise<unknown> {
  const result = await generateText({
    model: req.model,
    ...(req.system ? { instructions: req.system } : {}),
    messages: toUserMessages(req.user),
    output: Output.object({ schema: jsonSchema(req.jsonSchema), name: req.schemaName }),
    ...(req.reasoningEffort ? { reasoning: req.reasoningEffort } : {}),
    maxRetries: 0, // retries live in withTransientRetry, one layer up
    timeout: { totalMs: req.budgetMs },
    ...(req.gatewayOptions ? { providerOptions: { gateway: req.gatewayOptions } } : {}),
  });
  return result.output;
}
