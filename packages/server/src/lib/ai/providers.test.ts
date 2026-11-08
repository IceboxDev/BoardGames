import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { parseModelId } from "./models";
import { readUsage } from "./providers";

function usage(input: number, output: number, cacheRead = 0, cacheWrite = 0): LanguageModelUsage {
  return {
    inputTokens: input,
    inputTokenDetails: {
      noCacheTokens: input - cacheRead - cacheWrite,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    },
    outputTokens: output,
    outputTokenDetails: { textTokens: output, reasoningTokens: undefined },
    totalTokens: input + output,
  };
}

describe("readUsage", () => {
  it("keeps the gateway's billed cost and the model that answered", () => {
    const u = readUsage(parseModelId("openai/gpt-5.2"), usage(100, 20), {
      gateway: {
        cost: "0.0123",
        generationId: "gen_1",
        routing: { canonicalSlug: "openai/gpt-5.2" },
      },
    });
    expect(u).toMatchObject({
      costUsd: 0.0123,
      costSource: "billed",
      resolvedModel: "openai/gpt-5.2",
      generationId: "gen_1",
    });
  });

  it("prices a direct Anthropic call from list prices, cache reads cheap", () => {
    // Opus 5.5: $4 in, $20 out, $0.20 cache read, $5 cache write per million.
    const u = readUsage(
      parseModelId("anthropic:claude-opus-5-5"),
      usage(10_000, 1_000, 6_000, 2_000),
      undefined,
    );
    expect(u.costSource).toBe("list");
    expect(u.cacheReadTokens).toBe(6_000);
    expect(u.costUsd).toBeCloseTo((2_000 * 4 + 6_000 * 0.2 + 2_000 * 5 + 1_000 * 20) / 1e6, 10);
  });

  it("leaves an unpriced model's cost null", () => {
    const u = readUsage(parseModelId("openai:gpt-5.2"), usage(10, 10), undefined);
    expect(u.costUsd).toBeNull();
    expect(u.costSource).toBeNull();
  });
});
