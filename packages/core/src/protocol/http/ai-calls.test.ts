import { describe, expect, it } from "vitest";
import { AiCallDetailSchema, AiCallsQuerySchema, AiCallsResponseSchema } from "./ai-calls";

const usage = {
  inputTokens: 10,
  outputTokens: 5,
  reasoningTokens: null,
  costUsd: 0.001,
  resolvedModel: "openai/gpt-5.2",
  generationId: null,
};
const summary = {
  id: "ai_x",
  at: "2026-10-11T10:00:00.000Z",
  feature: "codenames",
  label: "codenames-clue",
  model: "openai/gpt-5.2",
  ms: 1200,
  ok: true,
  error: null,
  attempts: 1,
  usage,
};

describe("ai-calls protocol", () => {
  it("parses a listing and a detail", () => {
    expect(
      AiCallsResponseSchema.parse({
        totals: { codenames: { calls: 1, costUsd: 0.001, failed: 0 } },
        calls: [summary],
      }).calls,
    ).toHaveLength(1);
    expect(
      AiCallDetailSchema.parse({
        ...summary,
        transport: "stream",
        system: null,
        user: "u",
        output: {},
      }).user,
    ).toBe("u");
  });

  it("defaults and bounds the query", () => {
    expect(AiCallsQuerySchema.parse({}).limit).toBe(50);
    expect(AiCallsQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(() => AiCallsQuerySchema.parse({ limit: "0" })).toThrow();
    expect(() => AiCallsQuerySchema.parse({ limit: "1000" })).toThrow();
  });

  it("rejects a summary missing its usage", () => {
    const { usage: _u, ...bad } = summary;
    const r = AiCallsResponseSchema.safeParse({ totals: {}, calls: [bad] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["calls", 0, "usage"]);
  });
});
