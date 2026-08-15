import OpenAI, { type ClientOptions } from "openai";

/**
 * Shared OpenAI plumbing for short, structured game-AI calls (Decrypto's GPT
 * agents). Extracted in the image of `dnd-extract.ts`, which keeps its own
 * private copy for the long-running D&D generations.
 *
 * Transport: background mode + short polls, same as the D&D referee — any
 * long-lived HTTP connection to OpenAI eventually gets severed on Railway's
 * egress path ("Premature close"), and even a short reasoning call can sit
 * quiet for tens of seconds. The create call returns as soon as the job is
 * queued; completion is fetched with short, individually-retried polls.
 */

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  // node-fetch@2's "Premature close" bug fires on Railway; undici doesn't have it.
  return new OpenAI({ apiKey, fetch: globalThis.fetch as unknown as ClientOptions["fetch"] });
}

const TRANSIENT_ERROR =
  /premature close|invalid response body|econnreset|econnrefused|etimedout|socket hang up|terminated|fetch failed|network|aborted|connection error/i;

function transientMessage(err: unknown): string {
  if (!(err instanceof Error)) return "";
  const cause = err.cause instanceof Error ? ` ${err.cause.message}` : "";
  return `${err.message}${cause}`;
}

/** Full error→cause chain with codes, for deploy logs. */
export function causeChain(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = "code" in cur && typeof cur.code === "string" ? ` [${cur.code}]` : "";
    parts.push(`${cur.name}: ${cur.message}${code}`);
    cur = cur.cause;
  }
  return parts.join(" ← ") || String(err);
}

async function withTransientRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !TRANSIENT_ERROR.test(transientMessage(err))) {
        console.error(
          `[${label}] openai call failed (attempt ${attempt}/${attempts}):`,
          causeChain(err),
        );
        throw err;
      }
      console.warn(`[${label}] openai transient error (attempt ${attempt}/${attempts}), retrying`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastErr;
}

function responseOutputText(res: OpenAI.Responses.Response): string {
  if (typeof res.output_text === "string" && res.output_text.length > 0) return res.output_text;
  return res.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content)
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("");
}

export interface StructuredCallArgs {
  label: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  /** Strict JSON Schema (additionalProperties: false, all properties required). */
  jsonSchema: Record<string, unknown>;
  /** Total budget for queue + generation, ms. */
  budgetMs: number;
  /** Reasoning effort for gpt-5-family models. Omit for the model default. */
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * One structured background call: create with `background: true`, poll every
 * second until terminal or the budget runs out, parse the JSON text. Throws on
 * failure — callers own their fallback.
 */
export async function structuredCall(client: OpenAI, args: StructuredCallArgs): Promise<unknown> {
  const params: Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, "stream"> = {
    model: args.model,
    ...(args.reasoningEffort ? { reasoning: { effort: args.reasoningEffort } } : {}),
    instructions: args.system,
    input: [{ role: "user", content: [{ type: "input_text", text: args.user }] }],
    text: {
      format: {
        type: "json_schema",
        name: args.schemaName,
        strict: true,
        schema: args.jsonSchema,
      },
    },
  };
  const deadline = Date.now() + args.budgetMs;
  let res = await withTransientRetry(args.label, () =>
    client.responses.create({ ...params, background: true }),
  );
  while (res.status === "queued" || res.status === "in_progress") {
    if (Date.now() > deadline) {
      throw new Error(`openai response ${res.id} still ${res.status} after ${args.budgetMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    res = await withTransientRetry(args.label, () => client.responses.retrieve(res.id));
  }
  if (res.status !== "completed") {
    const detail = res.error?.message ?? res.incomplete_details?.reason ?? "no detail";
    throw new Error(`openai response ${res.status ?? "unknown"}: ${detail}`);
  }
  return JSON.parse(responseOutputText(res));
}
