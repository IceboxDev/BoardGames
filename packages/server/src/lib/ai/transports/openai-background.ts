import OpenAI, { type ClientOptions } from "openai";
import { openAiKey } from "../config";
import { AiConfigError } from "../errors";
import { withTransientRetry } from "../retry";
import type { AiTransportRequest } from "./types";

/**
 * Escape-hatch transport: the pre-migration OpenAI background+poll flow,
 * preserved verbatim because it is the one transport proven against
 * Railway's egress path severing long-lived connections. Requires a direct
 * `OPENAI_API_KEY` (bills OpenAI, not gateway credits) and an `openai/*`
 * model slug. The create call returns as soon as the job is queued;
 * completion is fetched with short, individually-retried polls.
 */

const POLL_INTERVAL_MS = 1_000;

function getClient(): OpenAI {
  const apiKey = openAiKey();
  if (!apiKey) {
    throw new AiConfigError("openai-background transport needs OPENAI_API_KEY.");
  }
  // node-fetch@2's "Premature close" bug fires on Railway; undici doesn't have it.
  return new OpenAI({ apiKey, fetch: globalThis.fetch as unknown as ClientOptions["fetch"] });
}

function openAiModel(slug: AiTransportRequest["model"]): string {
  if (typeof slug !== "string" || !slug.startsWith("openai/")) {
    throw new AiConfigError(
      `openai-background transport only runs openai/* models, got "${String(slug)}".`,
    );
  }
  return slug.slice("openai/".length);
}

type InputContent =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

function toInputContent(user: AiTransportRequest["user"]): InputContent[] {
  if (typeof user === "string") return [{ type: "input_text", text: user }];
  return user.map((part) =>
    part.type === "text"
      ? { type: "input_text" as const, text: part.text }
      : {
          type: "input_file" as const,
          filename: part.filename ?? "input.pdf",
          file_data: part.dataUri,
        },
  );
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

export async function openAiBackgroundTransport(req: AiTransportRequest): Promise<unknown> {
  const client = getClient();
  const params: Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, "stream"> = {
    model: openAiModel(req.model),
    ...(req.reasoningEffort ? { reasoning: { effort: req.reasoningEffort } } : {}),
    ...(req.system ? { instructions: req.system } : {}),
    input: [{ role: "user", content: toInputContent(req.user) }],
    text: {
      format: {
        type: "json_schema",
        name: req.schemaName,
        strict: true,
        schema: req.jsonSchema,
      },
    },
  };
  // Each HTTP call is retried individually — a transient blip mid-poll must
  // never restart the (possibly minutes-long) background job itself.
  const deadline = Date.now() + req.budgetMs;
  let res = await withTransientRetry(req.label, () =>
    client.responses.create({ ...params, background: true }),
  );
  while (res.status === "queued" || res.status === "in_progress") {
    if (Date.now() > deadline) {
      throw new Error(`openai response ${res.id} still ${res.status} after ${req.budgetMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    res = await withTransientRetry(req.label, () => client.responses.retrieve(res.id));
  }
  if (res.status !== "completed") {
    const detail = res.error?.message ?? res.incomplete_details?.reason ?? "no detail";
    throw new Error(`openai response ${res.status ?? "unknown"}: ${detail}`);
  }
  return JSON.parse(responseOutputText(res));
}
