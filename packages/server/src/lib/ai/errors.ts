import { AI_SUSPENDED_MESSAGE } from "../ai-suspend";

/**
 * Thrown when AI is unavailable for configuration reasons: suspended via
 * AI_SUSPENDED, no gateway/provider key, or a transport/model mismatch.
 * Feature-specific subclasses (DndConfigError, AvatarConfigError) exist so
 * older catch sites keep working; routes map any AiConfigError to
 * 503 NOT_CONFIGURED and game seats fall back deterministically.
 */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

/** Gateway credits exhausted (HTTP 402 hard budget limit) — same 503 surface. */
export class AiBudgetError extends AiConfigError {
  constructor(message = "AI credits are exhausted — generation is paused.") {
    super(message);
    this.name = "AiBudgetError";
  }
}

export function suspendedError(): AiConfigError {
  return new AiConfigError(AI_SUSPENDED_MESSAGE);
}

/** Full error→cause chain with codes, for deploy logs. */
export function causeChain(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = "code" in cur && typeof cur.code === "string" ? ` [${cur.code}]` : "";
    parts.push(`${cur.name}: ${cur.message}${code}`);
    cur = cur.cause;
  }
  return parts.join(" ← ") || String(err);
}
