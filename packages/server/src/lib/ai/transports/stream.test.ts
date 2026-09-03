import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { streamTransport } from "./stream";
import type { AiTransportRequest } from "./types";

const SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

const USAGE = {
  inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function request(model: AiTransportRequest["model"]): AiTransportRequest {
  return {
    model,
    label: "test",
    system: "sys",
    user: "hello",
    schemaName: "test_schema",
    jsonSchema: SCHEMA,
    budgetMs: 5_000,
  };
}

describe("streamTransport", () => {
  it("assembles the structured object from streamed deltas", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: '{"answer":' },
            { type: "text-delta", id: "text-1", delta: '"hi"}' },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: { unified: "stop" as const, raw: undefined },
              logprobs: undefined,
              usage: USAGE,
            },
          ],
        }),
      }),
    });
    await expect(streamTransport(request(model))).resolves.toEqual({ answer: "hi" });
  });

  it("surfaces mid-stream errors as a throw", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            { type: "error", error: new Error("provider exploded") },
          ],
        }),
      }),
    });
    await expect(streamTransport(request(model))).rejects.toThrow(/provider exploded/);
  });
});
