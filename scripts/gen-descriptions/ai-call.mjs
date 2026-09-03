// Gateway AI wrapper. One call per game.
//
// Model: AI_MODEL_DESCRIPTIONS ?? AI_MODEL ?? openai/gpt-5.2, with OpenAI's
// hosted web_search tool attached — the pipeline's "browse the web before
// writing" semantics, same as the pre-migration Responses setup, now routed
// through the AI Gateway. If you override the model to a non-OpenAI slug,
// pick one that can ground itself in live search results (e.g. a Perplexity
// sonar model; the tool is only attached to openai/* slugs).
//
// Retry policy (unchanged from the OpenAI era):
//   - Transient (429 / 5xx / network): up to 2 retries with exponential
//     backoff (1s, 3s).
//   - Schema validation failure: 1 retry with a reminder of the over-budget
//     field. After that, hard fail — log and skip.

import { openai } from "@ai-sdk/openai";
import { generateText, jsonSchema, Output } from "ai";
import { resolveScriptModel } from "../lib/ai.mjs";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.mjs";
import { GeneratedDescriptionsSchema, RESPONSE_JSON_SCHEMA } from "./schema.mjs";

const MODEL = resolveScriptModel("AI_MODEL_DESCRIPTIONS", "openai/gpt-5.2");
// OpenAI's provider-executed search tool — only attach it to openai/* slugs.
const TOOLS = MODEL.startsWith("openai/") ? { web_search: openai.tools.webSearch() } : undefined;
const TRANSIENT_BACKOFF_MS = [1000, 3000];

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

// Editorial char budgets (zod is the arbiter — keep in sync with schema.mjs).
const BUDGETS = { tight: 220, default: 340, loose: 560 };
const SENTENCE_SPLIT = /(?<=[.?!]["”’]?)\s+/u;

/** Drop trailing complete sentences until `text` fits `max`. Null when a
 * single sentence alone is still over budget (nothing safe to cut). */
function trimToBudget(text, max) {
  let out = text.trim();
  while (out.length > max) {
    const sentences = out.split(SENTENCE_SPLIT);
    if (sentences.length <= 1) return null;
    sentences.pop();
    out = sentences.join(" ").trim();
  }
  return out;
}

// Web-search-grounded models sometimes inline citations into the prose —
// "…to buy. ([allplay.com](https://…))." — which would render literally in
// the carousel. Strip parenthesized markdown-link citations and unwrap bare
// markdown links, then tidy the leftover spacing/punctuation. Runs before
// zod, so a field that drops under its min length fails loudly and re-prompts
// instead of shipping citation soup.
function stripCitations(text) {
  return text
    .replace(/\s*\(\s*\[[^\]]*\]\([^)]*\)\s*\)\s*([.,;:])?/gu, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\s+([.,;:])/gu, "$1")
    .replace(/\.{2,}/gu, ".")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function stripCitationFields(raw) {
  if (typeof raw !== "object" || raw === null) return raw;
  const out = { ...raw };
  for (const key of ["tight", "default", "loose"]) {
    if (typeof out[key] === "string") out[key] = stripCitations(out[key]);
  }
  return out;
}

/** Mechanical salvage for over-budget-but-complete output: the decoder caps
 * sit ~25% above the zod budgets (schema.mjs), so a verbose model emits whole
 * sentences past budget — trimming the trailing ones is editorially safe and
 * beats burning another rate-limited call (Arcs failed four paced attempts
 * purely on length). Returns null when any field can't be trimmed. */
function salvageOverruns(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const out = { ...raw };
  for (const [key, max] of Object.entries(BUDGETS)) {
    if (typeof out[key] === "string" && out[key].length > max) {
      const trimmed = trimToBudget(out[key], max);
      if (trimmed === null) return null;
      out[key] = trimmed;
    }
  }
  return out;
}

async function callOnce(userPrompt, schemaReminder) {
  const prompt = schemaReminder
    ? `${userPrompt}\n\nYour previous output failed schema validation: ${schemaReminder}. Rewrite ALL three variants noticeably SHORTER — aim for tight ≤200 chars, default ≤310 chars, loose ≤510 chars (hard caps 220/340/560). Cut adjectives and subclauses, never end mid-sentence.`
    : userPrompt;

  const result = await generateText({
    model: MODEL,
    instructions: SYSTEM_PROMPT,
    prompt,
    // Without this, gpt-5.2 barely plans (~150 reasoning tokens), overshoots
    // the prompt's soft char targets, and gets truncated mid-sentence by the
    // schema's hard maxLength caps (constrained decoding stops at the cap).
    // "medium" fixed most games; mechanically dense ones (arcs) still
    // truncated twice in a row, so give the planner full headroom.
    reasoning: "high",
    maxRetries: 0, // the loop above owns retries; SDK retries just hammer the free-tier throttle
    ...(TOOLS ? { tools: TOOLS } : {}),
    output: Output.object({
      schema: jsonSchema(RESPONSE_JSON_SCHEMA),
      name: "game_descriptions",
    }),
    providerOptions: { gateway: { tags: ["feature:descriptions"] } },
  });

  // The zod schema stays the arbiter (char budgets etc.) so the
  // schema-failure re-prompt keeps working across providers.
  const cleaned = stripCitationFields(result.output);
  const parsed = GeneratedDescriptionsSchema.safeParse(cleaned);
  if (!parsed.success) {
    const salvaged = salvageOverruns(cleaned);
    if (salvaged) {
      const reparsed = GeneratedDescriptionsSchema.safeParse(salvaged);
      if (reparsed.success) {
        console.warn("  · over-budget output trimmed at sentence boundaries");
        return reparsed.data;
      }
    }
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw Object.assign(new Error(`Schema validation failed: ${issues}`), {
      isSchemaFailure: true,
      schemaReminder: issues,
    });
  }
  return parsed.data;
}

function isTransient(err) {
  if (err.isSchemaFailure) return false;
  const status = err.status ?? err.statusCode;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  // Network-level (no status): assume transient. The user can ctrl-C if not.
  if (status === undefined && (err.code || /fetch failed|network|timeout/i.test(err.message ?? "")))
    return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
