import {
  type LanguageModel,
  type ModelMessage,
  type StepResult,
  type StopCondition,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
} from "ai";
import { aiSuspended } from "../ai-suspend";
import { type AiFeature, modelForRole, resolveModel } from "./config";
import { causeChain, suspendedError } from "./errors";
import { type AiCallRecord, newAiCallId, recordAiCall } from "./ledger";
import { type AiRole, languageModel, type ModelRef, requireKey } from "./models";
import { adapterFor, readUsage } from "./providers";

// ── Agents: a model that calls our tools until the job is done ─────────────
//
// The AI SDK's ToolLoopAgent, run on the same profiles, provider options,
// kill switch and ledger as every single call (generate.ts). Each step — one
// model call plus the tools it asked for — is one ledger record; a run's
// steps share a `runId`, so `/api/admin/ai-calls` and the trace files show a
// whole run in order. A run stops at its step cap, its dollar budget, or when
// the model answers without calling a tool. Tools are typed with `tool()` +
// zod (lib/ai/tools/); MCP tools come from `connectMcpTools` (mcp.ts).

export interface AgentSpec<TOOLS extends ToolSet> {
  feature?: AiFeature;
  /** Log prefix; each step records as `<label>#<n>`. */
  label: string;
  /** Which model: a role in the active profile (default `smart`), or an explicit pin. */
  role?: AiRole;
  modelOverride?: string;
  instructions: string;
  tools: TOOLS;
  /** Hard cap on model calls per run (default 8). */
  maxSteps?: number;
  /** Stop once the run has spent this many dollars (checked after each step). */
  budgetUsd?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface AgentRun {
  runId: string;
  text: string;
  steps: ReadonlyArray<StepResult<ToolSet>>;
  /** Summed over the steps; null when no step could be priced. */
  costUsd: number | null;
  model: string;
}

function stepCost(ref: ModelRef, step: StepResult<ToolSet>): number | null {
  return readUsage(ref, step.usage, step.providerMetadata).costUsd;
}

/** Stops a run once its steps have cost `usd` or more. */
export function budgetSpent(ref: ModelRef, usd: number): StopCondition<ToolSet> {
  return ({ steps }) => steps.reduce((sum, s) => sum + (stepCost(ref, s) ?? 0), 0) >= usd;
}

function describeInput(prompt: string | ModelMessage[]): string {
  return typeof prompt === "string" ? prompt : JSON.stringify(prompt);
}

let modelOverrideForTests: LanguageModel | null = null;

/** Test seam: every agent runs on this model (null restores the registry). */
export function setAgentModelForTests(model: LanguageModel | null): void {
  modelOverrideForTests = model;
}

export function defineAgent<TOOLS extends ToolSet>(spec: AgentSpec<TOOLS>) {
  const feature = spec.feature ?? "agent";
  return {
    /** One run, to completion. Throws AiConfigError (suspended / unkeyed) or the provider's error. */
    async run(
      prompt: string | ModelMessage[],
      options: { abortSignal?: AbortSignal } = {},
    ): Promise<AgentRun> {
      if (aiSuspended()) throw suspendedError();
      const ref = spec.modelOverride
        ? resolveModel(feature, spec.modelOverride)
        : modelForRole(spec.role ?? "smart");
      if (!modelOverrideForTests) requireKey(ref);
      const adapter = adapterFor(ref);
      const runId = newAiCallId().replace(/^ai_/, "run_");
      const providerOptions = adapter.providerOptions({ feature });
      let stepStarted = Date.now();
      let stepNo = 0;

      const record = (patch: Partial<AiCallRecord> & Pick<AiCallRecord, "ok" | "usage">) => {
        recordAiCall({
          id: newAiCallId(),
          at: new Date(stepStarted).toISOString(),
          feature,
          label: `${spec.label}#${stepNo}`,
          model: ref.id,
          transport: "agent",
          ms: Date.now() - stepStarted,
          error: null,
          attempts: 1,
          runId,
          system: stepNo === 0 ? spec.instructions : null,
          user: stepNo === 0 ? describeInput(prompt) : "(tool results)",
          output: null,
          ...patch,
        });
      };

      // Typed over the plain ToolSet: the run's own tool types end at the
      // spec; what comes back is read through StepResult<ToolSet>.
      const tools: ToolSet = spec.tools;
      const agent = new ToolLoopAgent<never, ToolSet>({
        model: modelOverrideForTests ?? languageModel(ref),
        instructions: adapter.instructions(spec.instructions),
        tools,
        stopWhen: [
          stepCountIs(spec.maxSteps ?? 8),
          ...(spec.budgetUsd !== undefined ? [budgetSpent(ref, spec.budgetUsd)] : []),
        ],
        ...(spec.reasoningEffort ? { reasoning: spec.reasoningEffort } : {}),
        ...(providerOptions ? { providerOptions } : {}),
        // The kill switch holds between steps too, not only at the start.
        prepareStep: () => {
          if (aiSuspended()) throw suspendedError();
          return undefined;
        },
      });

      let costUsd: number | null = null;
      try {
        const result = await agent.generate({
          prompt,
          ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
          onStepEnd: (step) => {
            const usage = readUsage(ref, step.usage, step.providerMetadata);
            if (usage.costUsd !== null) costUsd = (costUsd ?? 0) + usage.costUsd;
            record({
              ok: true,
              usage,
              output: {
                text: step.text,
                toolCalls: step.toolCalls.map((c) => ({ tool: c.toolName, input: c.input })),
                finishReason: step.finishReason,
              },
            });
            stepNo += 1;
            stepStarted = Date.now();
          },
        });
        return { runId, text: result.text, steps: result.steps, costUsd, model: ref.id };
      } catch (err) {
        record({ ok: false, usage: readUsage(ref, undefined, undefined), error: causeChain(err) });
        throw err;
      }
    },
  };
}
