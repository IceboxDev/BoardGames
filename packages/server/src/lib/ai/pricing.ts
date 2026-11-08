import type { LanguageModelUsage } from "ai";
import type { ModelRef } from "./models";

// ── What a call cost, when the provider doesn't say ────────────────────────
//
// The gateway reports each call's billed dollars (`providerMetadata.gateway
// .cost`); a direct provider doesn't, so the ledger computes it from these
// list prices (USD per million tokens). A model missing here records a null
// cost. Prices as of 2026-10-06 (platform.claude.com pricing); update the
// date with the numbers.

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute cache writes. */
  cacheWrite: number;
  /** Prompts longer than this many tokens bill at `long` instead. */
  longAbove?: number;
  long?: Omit<Price, "longAbove" | "long">;
}

const PRICES: Record<string, Price> = {
  "anthropic:claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "anthropic:claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    longAbove: 100_000,
    long: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
  },
  "anthropic:claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export function hasListPrice(ref: ModelRef): boolean {
  return ref.id in PRICES;
}

/** Dollars for one call's usage at list price; null when the model has no price row. */
export function listPriceCost(ref: ModelRef, usage: LanguageModelUsage | undefined): number | null {
  const base = PRICES[ref.id];
  if (!base || !usage) return null;
  const input = usage.inputTokens ?? 0;
  const price =
    base.longAbove !== undefined && base.long && input > base.longAbove ? base.long : base;
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const fresh =
    usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, input - cacheRead - cacheWrite);
  const output = usage.outputTokens ?? 0;
  const micro =
    fresh * price.input +
    cacheRead * price.cacheRead +
    cacheWrite * price.cacheWrite +
    output * price.output;
  return micro / 1_000_000;
}
