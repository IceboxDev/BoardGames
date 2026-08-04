import type { Context, MiddlewareHandler } from "hono";

/**
 * In-process sliding-window rate limiting.
 *
 * Before this, the only rate limit anywhere in the server was on BGA ingest.
 * `/api/auth/sign-in/email` accepted unlimited password guesses against an
 * 8-character minimum, and every OpenAI-backed route could be replayed at will
 * against the owner's billing account.
 *
 * Deliberately in-memory: this is a single-process server (see the session
 * manager — game actors live in module scope), so a shared store would buy
 * nothing today. If the server is ever horizontally scaled, this is one of the
 * things that MUST move to Redis — the limiter degrades to per-instance and
 * the effective limit multiplies by the instance count.
 */

export interface RateLimitOptions {
  /** Bucket name, so unrelated routes never share a counter. */
  name: string;
  windowMs: number;
  max: number;
  /** Defaults to the authenticated user id, falling back to client IP. */
  key?: (c: Context) => string;
  message?: string;
  /**
   * Only count state-changing requests. Use when the cost being limited is a
   * side effect (an AI generation, an email) rather than the request itself.
   */
  skipSafeMethods?: boolean;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Best-effort client IP. Railway terminates TLS and sets `x-forwarded-for`. */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return c.req.header("x-real-ip") ?? "unknown";
}

function defaultKey(c: Context): string {
  // `user` is only set once requireAuth has run; before that, fall back to IP.
  const user = c.get("user") as { id?: string } | undefined;
  return user?.id ? `u:${user.id}` : `ip:${clientIp(c)}`;
}

/**
 * Drop buckets whose entire window has expired.
 *
 * Without this the map grows one entry per distinct key forever, which is the
 * same unbounded-Map problem the session layer had.
 */
function prune(now: number, windowMs: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - (bucket.hits.at(-1) ?? 0) > windowMs) {
      buckets.delete(key);
    }
  }
}

let pruneCounter = 0;
const PRUNE_EVERY = 500;

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { name, windowMs, max, message } = options;
  const keyOf = options.key ?? defaultKey;

  return async (c, next) => {
    if (options.skipSafeMethods && SAFE_METHODS.has(c.req.method.toUpperCase())) {
      return next();
    }

    const now = Date.now();
    const key = `${name}:${keyOf(c)}`;

    if (++pruneCounter >= PRUNE_EVERY) {
      pruneCounter = 0;
      prune(now, windowMs);
    }

    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((at) => now - at < windowMs);

    if (bucket.hits.length >= max) {
      buckets.set(key, bucket);
      const retryAfter = Math.ceil((windowMs - (now - (bucket.hits[0] ?? now))) / 1000);
      c.header("Retry-After", String(Math.max(retryAfter, 1)));
      return c.json(
        { error: message ?? "Too many requests — slow down.", code: "rate_limited" },
        429,
      );
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);
    await next();
  };
}

/** Test seam. */
export function __resetRateLimits(): void {
  buckets.clear();
  pruneCounter = 0;
}
