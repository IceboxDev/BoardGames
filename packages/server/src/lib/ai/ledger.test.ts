import { afterEach, describe, expect, it, vi } from "vitest";
import { setAiTransportsForTests, structuredGenerateTraced } from "./generate";
import { aiSpendTotals, EMPTY_USAGE, findAiCall, resetAiLedgerForTests } from "./ledger";

const ARGS = {
  feature: "codenames" as const,
  label: "codenames",
  system: "sys",
  user: "board",
  schemaName: "s",
  jsonSchema: { type: "object" },
  budgetMs: 1_000,
};

afterEach(() => {
  setAiTransportsForTests(null);
  resetAiLedgerForTests();
  vi.unstubAllEnvs();
});

describe("AI ledger", () => {
  it("records every call with the gateway's billed cost, summed over retries", async () => {
    vi.stubEnv("AI_SUSPENDED", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    vi.stubEnv("AI_TRANSPORT", "sync");
    let n = 0;
    setAiTransportsForTests({
      sync: async (req) => {
        n++;
        req.onUsage?.({ ...EMPTY_USAGE, inputTokens: 100, outputTokens: 20, costUsd: 0.01 });
        if (n === 1) throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
        return { ok: true };
      },
    });
    const { output, call } = await structuredGenerateTraced(ARGS);
    expect(output).toEqual({ ok: true });
    expect(call.attempts).toBe(2);
    expect(call.usage.costUsd).toBeCloseTo(0.02);
    expect(call.usage.inputTokens).toBe(200);
    expect(call.user).toBe("board");
    expect(findAiCall(call.id)?.output).toEqual({ ok: true });
    expect(aiSpendTotals().codenames).toMatchObject({ calls: 1, failed: 0 });
  });

  it("records failures too", async () => {
    vi.stubEnv("AI_SUSPENDED", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    vi.stubEnv("AI_TRANSPORT", "sync");
    setAiTransportsForTests({
      sync: async () => {
        throw new Error("bad request");
      },
    });
    await expect(structuredGenerateTraced(ARGS)).rejects.toThrow("bad request");
    expect(aiSpendTotals().codenames).toMatchObject({ calls: 1, failed: 1 });
  });
});
