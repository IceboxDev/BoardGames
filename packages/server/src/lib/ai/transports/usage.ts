import type { LanguageModelUsage, ProviderMetadata } from "ai";
import type { AiCallUsage } from "../ledger";

/** A finished call's tokens and the gateway's billed cost, as the ledger keeps them. */
export function readUsage(
  usage: LanguageModelUsage | undefined,
  metadata: ProviderMetadata | undefined,
): AiCallUsage {
  const gateway = metadata?.gateway;
  const cost = gateway && typeof gateway.cost === "string" ? Number(gateway.cost) : Number.NaN;
  const routing = gateway?.routing;
  const resolved =
    routing &&
    typeof routing === "object" &&
    !Array.isArray(routing) &&
    typeof routing.canonicalSlug === "string"
      ? routing.canonicalSlug
      : null;
  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? null,
    costUsd: Number.isFinite(cost) ? cost : null,
    resolvedModel: resolved,
    generationId: gateway && typeof gateway.generationId === "string" ? gateway.generationId : null,
  };
}
