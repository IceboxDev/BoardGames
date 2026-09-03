import { APICallError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiBudgetError, AiConfigError } from "./errors";
import { setAiTransportsForTests, structuredGenerate } from "./generate";
import type { AiTransportRequest } from "./transports/types";

const BASE_ARGS = {
  feature: "dnd" as const,
  label: "test",
  system: "sys",
  user: "hello",
  schemaName: "test_schema",
  jsonSchema: { type: "object" },
  budgetMs: 1_000,
};

afterEach(() => {
  setAiTransportsForTests(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubGatewayEnv() {
  vi.stubEnv("AI_SUSPENDED", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("AI_TRANSPORT", "sync");
}

describe("structuredGenerate", () => {
  it("throws AiConfigError when suspended", async () => {
    vi.stubEnv("AI_SUSPENDED", "1");
    await expect(structuredGenerate(BASE_ARGS)).rejects.toBeInstanceOf(AiConfigError);
  });

  it("throws AiConfigError without a gateway key on gateway transports", async () => {
    vi.stubEnv("AI_SUSPENDED", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("AI_TRANSPORT", "sync");
    await expect(structuredGenerate(BASE_ARGS)).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });

  it("passes the resolved model, schema, and feature tag to the transport", async () => {
    stubGatewayEnv();
    vi.stubEnv("AI_MODEL_DND", "test/model");
    const seen: AiTransportRequest[] = [];
    setAiTransportsForTests({
      sync: async (req) => {
        seen.push(req);
        return { ok: true };
      },
    });
    await expect(structuredGenerate(BASE_ARGS)).resolves.toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.model).toBe("test/model");
    expect(seen[0]?.schemaName).toBe("test_schema");
    expect(seen[0]?.gatewayOptions?.tags).toEqual(["feature:dnd"]);
  });

  it("retries transient errors and succeeds", async () => {
    stubGatewayEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    setAiTransportsForTests({
      sync: async () => {
        calls += 1;
        if (calls === 1) throw new Error("fetch failed mid-flight");
        return { ok: true };
      },
    });
    await expect(structuredGenerate(BASE_ARGS)).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it("maps a gateway 402 to AiBudgetError without retrying", async () => {
    stubGatewayEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    setAiTransportsForTests({
      sync: async () => {
        calls += 1;
        throw new APICallError({
          message: "insufficient credits",
          url: "https://ai-gateway.vercel.sh/v1",
          requestBodyValues: {},
          statusCode: 402,
        });
      },
    });
    await expect(structuredGenerate(BASE_ARGS)).rejects.toBeInstanceOf(AiBudgetError);
    expect(calls).toBe(1);
  });

  it("maps a gateway free-tier restriction to AiBudgetError", async () => {
    stubGatewayEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    setAiTransportsForTests({
      sync: async () => {
        throw new Error(
          "Free tier requests on this model are rate-limited. Upgrade to paid credits at https://vercel.com/",
        );
      },
    });
    await expect(structuredGenerate(BASE_ARGS)).rejects.toBeInstanceOf(AiBudgetError);
  });

  it("does not wrap the openai-background transport in the outer retry", async () => {
    vi.stubEnv("AI_SUSPENDED", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("AI_TRANSPORT", "openai-background");
    let calls = 0;
    setAiTransportsForTests({
      "openai-background": async () => {
        calls += 1;
        throw new Error("fetch failed mid-flight");
      },
    });
    await expect(structuredGenerate(BASE_ARGS)).rejects.toThrow(/fetch failed/);
    expect(calls).toBe(1);
  });
});
