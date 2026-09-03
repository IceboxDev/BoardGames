import { APICallError } from "ai";
import { AiBudgetError, causeChain } from "./errors";

// Transport-string matcher inherited from the OpenAI era — Railway's egress
// path severs quiet long-lived connections ("Premature close"), and those
// faults surface under many names. SDK-level maxRetries is disabled so this
// is the one retry layer.
const TRANSIENT_ERROR =
  /premature close|invalid response body|econnreset|econnrefused|etimedout|socket hang up|terminated|fetch failed|network|aborted|connection error|timeout/i;

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function transientMessage(err: unknown): string {
  if (!(err instanceof Error)) return "";
  const cause = err.cause instanceof Error ? ` ${err.cause.message}` : "";
  return `${err.message}${cause}`;
}

// The gateway phrases both no-credit failure modes this way: model not in the
// free-tier subset (403 RestrictedModelsError) and free-tier rate limiting.
const FREE_TIER_RESTRICTED =
  /free tier .* (rate-limited|do not have access)|upgrade to paid credits/i;

/**
 * Credit problems — gateway hard budget limit (402) or a free-tier model
 * restriction — are non-retryable and become a typed config error so routes
 * 503 with a clear message and game seats fall back deterministically.
 */
export function classifyBudgetError(err: unknown): AiBudgetError | null {
  if (APICallError.isInstance(err) && err.statusCode === 402) return new AiBudgetError();
  if (FREE_TIER_RESTRICTED.test(transientMessage(err))) {
    return new AiBudgetError(
      "This model needs paid AI Gateway credits (or a free-tier model slug) — generation is paused.",
    );
  }
  return null;
}

export function isTransient(err: unknown): boolean {
  if (APICallError.isInstance(err)) {
    if (err.statusCode === 402) return false;
    if (err.statusCode !== undefined) return RETRYABLE_STATUS.has(err.statusCode);
    return err.isRetryable || TRANSIENT_ERROR.test(transientMessage(err));
  }
  return TRANSIENT_ERROR.test(transientMessage(err));
}

export async function withTransientRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      const budget = classifyBudgetError(err);
      if (budget) {
        console.error(`[${label}] ai budget exhausted:`, causeChain(err));
        throw budget;
      }
      lastErr = err;
      if (attempt === attempts || !isTransient(err)) {
        console.error(
          `[${label}] ai call failed (attempt ${attempt}/${attempts}):`,
          causeChain(err),
        );
        throw err;
      }
      console.warn(`[${label}] ai transient error (attempt ${attempt}/${attempts}), retrying`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastErr;
}
