// Shared AI plumbing for the local generation scripts (gen-skills,
// gen-descriptions). They run under tsx and resolve models through the
// server's own AI platform (packages/server/src/lib/ai/scripts.ts): the same
// AI_PROFILE, model pins (AI_MODEL_<FEATURE>, AI_MODEL), provider keys and
// AI_SUSPENDED kill switch, all read from packages/server/.env via --env-file.

import { generateText, jsonSchema, Output } from "ai";
import { scriptModel } from "../../packages/server/src/lib/ai/scripts.ts";

/** Exit with a clear message when the scripts must not make billed calls. */
export function ensureAiUsable(label, feature) {
  try {
    const { ref } = scriptModel(feature);
    console.log(`[${label}] model ${ref.id}`);
  } catch (err) {
    console.error(`[${label}] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/** The feature's model (ScriptModel: ref, model, callOptions, webSearch). */
export function resolveScriptModel(feature) {
  return scriptModel(feature);
}

/**
 * One structured call: strict JSON schema in, parsed object out. Throws on
 * failure — callers own their retry/re-prompt loops, as before.
 */
export async function structuredScriptCall({ model, system, user, schemaName, schema, tools }) {
  const result = await generateText({
    model: model.model,
    ...model.callOptions(system),
    prompt: user,
    maxRetries: 0, // callers own their retry loops; SDK retries just hammer the free-tier throttle
    output: Output.object({ schema: jsonSchema(schema), name: schemaName }),
    ...(tools ? { tools } : {}),
  });
  return result.output;
}
