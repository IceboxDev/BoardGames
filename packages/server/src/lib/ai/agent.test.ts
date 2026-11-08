import { tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAgent, setAgentModelForTests } from "./agent";
import { AiConfigError } from "./errors";
import { recentAiCalls, resetAiLedgerForTests } from "./ledger";
import { catalogLookup } from "./tools/catalog";

// Opus 5.5 list prices: 1000 in + 100 out = $0.006 a step.
const USAGE = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 100, text: 100, reasoning: undefined },
};

type Turn = { tool: string; input: unknown } | { text: string };

/** A model that plays the scripted turns in order (a tool call or a final answer). */
function scripted(turns: Turn[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const turn = turns[Math.min(i, turns.length - 1)];
      i += 1;
      if (turn && "tool" in turn) {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: `call_${i}`,
              toolName: turn.tool,
              input: JSON.stringify(turn.input),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage: USAGE,
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: turn?.text ?? "" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: USAGE,
        warnings: [],
      };
    },
  });
}

beforeEach(() => {
  resetAiLedgerForTests();
  vi.stubEnv("AI_SUSPENDED", "");
  vi.stubEnv("AI_PROFILE", "anthropic");
  vi.stubEnv("AI_MODEL", "");
});

afterEach(() => {
  setAgentModelForTests(null);
  vi.unstubAllEnvs();
});

describe("defineAgent", () => {
  it("calls a tool, reads its result and answers; one ledger record per step", async () => {
    setAgentModelForTests(
      scripted([{ tool: "catalogLookup", input: { query: "codenames" } }, { text: "done" }]),
    );
    const agent = defineAgent({
      label: "test-agent",
      instructions: "Use the catalog.",
      tools: { catalogLookup },
    });
    const run = await agent.run("Which Codenames games are there?");
    expect(run.text).toBe("done");
    expect(run.steps).toHaveLength(2);
    const first = run.steps[0]?.toolResults[0];
    expect(first?.toolName).toBe("catalogLookup");
    expect(JSON.stringify(first?.output)).toContain('"slug":"codenames"');
    expect(run.model).toBe("anthropic:claude-opus-5-5");
    expect(run.costUsd).toBeCloseTo(2 * 0.006, 10);

    const calls = recentAiCalls();
    expect(calls.map((c) => c.label)).toEqual(["test-agent#0", "test-agent#1"]);
    expect(new Set(calls.map((c) => c.runId))).toEqual(new Set([run.runId]));
    expect(calls[0]?.usage.costSource).toBe("list");
    expect(calls[0]?.system).toBe("Use the catalog.");
    expect(calls[1]?.system).toBeNull();
  });

  it("stops at the step cap", async () => {
    setAgentModelForTests(scripted([{ tool: "echo", input: { n: 1 } }]));
    const echo = tool({
      description: "echo",
      inputSchema: z.object({ n: z.number() }),
      execute: async ({ n }) => ({ n }),
    });
    const run = await defineAgent({
      label: "loop",
      instructions: "x",
      tools: { echo },
      maxSteps: 3,
    }).run("go");
    expect(run.steps).toHaveLength(3);
  });

  it("stops once the run has spent its budget", async () => {
    setAgentModelForTests(scripted([{ tool: "echo", input: { n: 1 } }]));
    const echo = tool({
      description: "echo",
      inputSchema: z.object({ n: z.number() }),
      execute: async ({ n }) => ({ n }),
    });
    const run = await defineAgent({
      label: "budget",
      instructions: "x",
      tools: { echo },
      maxSteps: 20,
      budgetUsd: 0.01, // $0.006 a step → stops after the second
    }).run("go");
    expect(run.steps).toHaveLength(2);
  });

  it("halts between steps when AI is suspended mid-run", async () => {
    setAgentModelForTests(scripted([{ tool: "suspend", input: {} }, { text: "never" }]));
    const suspend = tool({
      description: "flips the kill switch",
      inputSchema: z.object({}),
      execute: async () => {
        vi.stubEnv("AI_SUSPENDED", "1");
        return { ok: true };
      },
    });
    const agent = defineAgent({ label: "kill", instructions: "x", tools: { suspend } });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(agent.run("go")).rejects.toBeInstanceOf(AiConfigError);
    expect(recentAiCalls().at(-1)?.ok).toBe(false);
  });

  it("refuses to start without the provider's key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const agent = defineAgent({ label: "nokey", instructions: "x", tools: {} });
    await expect(agent.run("go")).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
