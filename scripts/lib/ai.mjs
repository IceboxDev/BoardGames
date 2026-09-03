// Shared AI plumbing for the local generation scripts (gen-skills,
// gen-descriptions). Calls go through the Vercel AI Gateway via the AI SDK —
// model ids are gateway slugs ("provider/model"), auth is AI_GATEWAY_API_KEY,
// both read from packages/server/.env via --env-file. The AI_SUSPENDED kill
// switch from that same file applies here too.

import { generateText, jsonSchema, Output } from "ai";

export function aiSuspended() {
  return /^(1|true|yes)$/i.test(process.env.AI_SUSPENDED ?? "");
}

/** Exit with a clear message when the scripts must not make billed calls. */
export function ensureAiUsable(label) {
  if (aiSuspended()) {
    console.error(`[${label}] AI_SUSPENDED is set (packages/server/.env) — AI usage is suspended.`);
    process.exit(1);
  }
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(`[${label}] AI_GATEWAY_API_KEY not set. Add it to packages/server/.env.`);
    process.exit(1);
  }
}

export function resolveScriptModel(featureVar, fallback) {
  return process.env[featureVar] || process.env.AI_MODEL || fallback;
}

/**
 * One structured call: strict JSON schema in, parsed object out. Throws on
 * failure — callers own their retry/re-prompt loops, as before.
 */
export async function structuredScriptCall({ model, system, user, schemaName, schema, tools }) {
  const result = await generateText({
    model,
    instructions: system,
    prompt: user,
    maxRetries: 0, // callers own their retry loops; SDK retries just hammer the free-tier throttle
    output: Output.object({ schema: jsonSchema(schema), name: schemaName }),
    ...(tools ? { tools } : {}),
    providerOptions: { gateway: { tags: [`feature:${schemaName}`] } },
  });
  return result.output;
}
