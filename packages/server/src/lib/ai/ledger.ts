import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeployedServer } from "../origins.ts";

/**
 * Every structured AI call, kept for cost and debugging (`structuredGenerate`
 * records each one, success or failure):
 *
 *   - one log line per call: feature, model, tokens, exact dollars, time, id;
 *   - running totals per feature since the process started (`aiSpendTotals`);
 *   - the last calls in full — prompt, answer, usage — in memory
 *     (`recentAiCalls`, `findAiCall`; admins read them at `/api/admin/ai-calls`,
 *     on production too);
 *   - and, off the deployed server (or wherever `AI_TRACE_DIR` points), the
 *     same full records appended to `scratch/ai-traces/<date>.jsonl`, so a
 *     surprising move can be read back later: grep the call id a game's notes
 *     carry.
 *
 * Cost is the gateway's own billed figure (`providerMetadata.gateway.cost`)
 * where there is one (`costSource: "billed"`); a direct provider's call is
 * priced from the list prices in pricing.ts (`"list"`); a model with neither
 * leaves it null.
 */

export interface AiCallUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  /** Prompt tokens read from / written to the provider's prompt cache. */
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  /** US dollars. */
  costUsd: number | null;
  /** Whether `costUsd` is the provider's bill or our list-price sum. */
  costSource: "billed" | "list" | null;
  /** The model that actually answered (after gateway fallbacks). */
  resolvedModel: string | null;
  generationId: string | null;
}

export interface AiCallRecord {
  id: string;
  at: string;
  feature: string;
  label: string;
  model: string;
  transport: string;
  ms: number;
  ok: boolean;
  error: string | null;
  /** Summed over every attempt (retries are billed too). */
  usage: AiCallUsage;
  attempts: number;
  /** An agent run's steps share one run id (agent.ts); single calls have none. */
  runId?: string;
  system: string | null;
  user: string;
  output: unknown;
}

export const EMPTY_USAGE: AiCallUsage = {
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  costUsd: null,
  costSource: null,
  resolvedModel: null,
  generationId: null,
};

/** Full records kept in memory (a few KB each) — what `/api/admin/ai-calls` serves. */
const RECENT_LIMIT = 400;
const recent: AiCallRecord[] = [];
const totals = new Map<string, { calls: number; costUsd: number; failed: number }>();

let seq = 0;
export function newAiCallId(): string {
  seq = (seq + 1) % 1_000_000;
  return `ai_${Date.now().toString(36)}${seq.toString(36).padStart(3, "0")}`;
}

const add = (a: number | null, b: number | null) =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

/** Two attempts' usage as one bill. */
export function sumUsage(a: AiCallUsage, b: AiCallUsage): AiCallUsage {
  return {
    inputTokens: add(a.inputTokens, b.inputTokens),
    outputTokens: add(a.outputTokens, b.outputTokens),
    reasoningTokens: add(a.reasoningTokens, b.reasoningTokens),
    cacheReadTokens: add(a.cacheReadTokens, b.cacheReadTokens),
    cacheWriteTokens: add(a.cacheWriteTokens, b.cacheWriteTokens),
    costUsd: add(a.costUsd, b.costUsd),
    costSource: b.costSource ?? a.costSource,
    resolvedModel: b.resolvedModel ?? a.resolvedModel,
    generationId: b.generationId ?? a.generationId,
  };
}

function traceDir(): string | null {
  const explicit = process.env.AI_TRACE_DIR?.trim();
  if (explicit) return explicit;
  if (process.env.VITEST || isDeployedServer()) return null;
  // src/lib/ai/ledger.ts → the repo root's gitignored scratch/.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..", "..", "scratch", "ai-traces");
}

async function writeTrace(record: AiCallRecord): Promise<void> {
  const dir = traceDir();
  if (!dir) return;
  try {
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${record.at.slice(0, 10)}.jsonl`), `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.warn(`[ai] trace not written: ${String(err)}`);
  }
}

function money(usd: number | null, source: AiCallUsage["costSource"] = "billed"): string {
  if (usd === null) return "$?";
  return `${source === "list" ? "~" : ""}$${usd.toFixed(4)}`;
}

export function recordAiCall(record: AiCallRecord): void {
  recent.push(record);
  if (recent.length > RECENT_LIMIT) recent.shift();
  const t = totals.get(record.feature) ?? { calls: 0, costUsd: 0, failed: 0 };
  t.calls += 1;
  t.costUsd += record.usage.costUsd ?? 0;
  if (!record.ok) t.failed += 1;
  totals.set(record.feature, t);

  if (!process.env.VITEST) {
    const u = record.usage;
    const cached = u.cacheReadTokens ? ` (${u.cacheReadTokens} cached)` : "";
    const tokens =
      u.inputTokens === null ? "" : ` · ${u.inputTokens}${cached}→${u.outputTokens ?? "?"} tok`;
    console.log(
      `[ai] ${record.label} · ${u.resolvedModel ?? record.model}${tokens} · ${money(u.costUsd, u.costSource)} · ${(record.ms / 1000).toFixed(1)}s${record.ok ? "" : " · FAILED"} · ${record.id} · ${record.feature} total ${money(t.costUsd)}`,
    );
  }
  void writeTrace(record);
}

/** Spend per feature since the process started. */
export function aiSpendTotals(): Record<
  string,
  { calls: number; costUsd: number; failed: number }
> {
  return Object.fromEntries(totals);
}

export function recentAiCalls(): readonly AiCallRecord[] {
  return recent;
}

export function findAiCall(id: string): AiCallRecord | undefined {
  return recent.find((r) => r.id === id);
}

/** Test seam. */
export function resetAiLedgerForTests(): void {
  recent.length = 0;
  totals.clear();
}
