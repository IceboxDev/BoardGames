// OpenAI Responses-API wrapper. One call per game.
//
// Why Responses and not Chat Completions:
//   The `web_search` tool lives on the Responses API. The model needs to
//   browse before writing, so Chat Completions isn't an option.
//
// Why per-game (no Batch API):
//   OpenAI's Batch API doesn't currently support tool calls (web_search in
//   particular). We accept full per-call price to keep the "browse the web
//   before writing" semantics the user explicitly asked for.
//
// Retry policy:
//   - Transient (429 / 5xx / network): up to 2 retries with exponential
//     backoff (1s, 3s).
//   - Schema validation failure: 1 retry with a reminder of the over-budget
//     field. After that, hard fail — log and skip.

import OpenAI from "openai";
import { RESPONSE_JSON_SCHEMA, GeneratedDescriptionsSchema } from "./schema.mjs";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.mjs";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";
const TRANSIENT_BACKOFF_MS = [1000, 3000];

let _client = null;
function client() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not set. Add it to packages/server/.env and re-run.",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Generate descriptions for one game. Returns `{ data, meta }`:
 *   - data: the validated GeneratedDescriptionsSchema payload.
 *   - meta: { model, generatedAt, durationMs } for the generated file.
 * Throws on non-recoverable failure (after retries exhausted).
 */
export async function generateForGame(snapshotEntry) {
  const userPrompt = buildUserPrompt(snapshotEntry);
  const start = Date.now();
  let lastError = null;

  // Transient-error retry loop.
  for (let attempt = 0; attempt <= TRANSIENT_BACKOFF_MS.length; attempt++) {
    try {
      const data = await callOnce(userPrompt, /* schemaReminder */ null);
      return {
        data,
        meta: {
          model: MODEL,
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        },
      };
    } catch (err) {
      lastError = err;
      if (err.isSchemaFailure) {
        // One reminder attempt with the over-budget field.
        try {
          const data = await callOnce(userPrompt, err.schemaReminder);
          return {
            data,
            meta: {
              model: MODEL,
              generatedAt: new Date().toISOString(),
              durationMs: Date.now() - start,
            },
          };
        } catch (err2) {
          lastError = err2;
          break;
        }
      }
      if (!isTransient(err) || attempt === TRANSIENT_BACKOFF_MS.length) break;
      await sleep(TRANSIENT_BACKOFF_MS[attempt]);
    }
  }
  throw lastError;
}

async function callOnce(userPrompt, schemaReminder) {
  const input = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
  if (schemaReminder) {
    input.push({
      role: "user",
      content: `Your previous output failed schema validation: ${schemaReminder}. Re-emit the JSON object respecting every char budget.`,
    });
  }

  const response = await client().responses.create({
    model: MODEL,
    input,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    text: {
      format: {
        type: "json_schema",
        name: "game_descriptions",
        strict: true,
        schema: RESPONSE_JSON_SCHEMA,
      },
    },
  });

  const text = extractOutputText(response);
  if (!text) {
    throw Object.assign(new Error("OpenAI returned no output_text"), {
      isTransient: false,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw Object.assign(new Error(`Output was not JSON: ${e.message}`), {
      isTransient: false,
    });
  }

  const result = GeneratedDescriptionsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw Object.assign(new Error(`Schema validation failed: ${issues}`), {
      isSchemaFailure: true,
      schemaReminder: issues,
    });
  }
  return result.data;
}

// The Responses API surface exposes a convenience `output_text` aggregator on
// successful calls. Defensive fallback: walk `output[]` for the assistant's
// final text content if `output_text` is absent (older SDK shapes).
function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.length) {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) return null;
  for (const item of response.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

function isTransient(err) {
  if (err.isSchemaFailure) return false;
  const status = err.status ?? err.statusCode;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  // Network-level (no status): assume transient. The user can ctrl-C if not.
  if (status === undefined && err.code) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
