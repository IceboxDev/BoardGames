import type { MiddlewareHandler } from "hono";
import { isTrustedOrigin } from "./origins.ts";

/**
 * Cross-site request forgery guard for state-changing API calls.
 *
 * `hono/cors` is NOT a CSRF defence. On a disallowed origin it merely omits
 * the `Access-Control-Allow-Origin` header and calls `next()` — the handler
 * still runs and the side effect still commits; the attacker just can't read
 * the response. Combined with production's `SameSite=None` cookies, any
 * BODYLESS cross-origin POST is a CORS "simple request": no preflight, no
 * `Content-Type`, executed with the victim's session. That reached, among
 * others, `POST /api/admin/users/:id/reset-link` (as an admin) and several
 * billed OpenAI routes.
 *
 * Two independent signals, either of which is conclusive:
 *   - `Sec-Fetch-Site` — set by the browser, unforgeable from JavaScript.
 *   - `Origin` — present on every cross-site request a browser makes.
 *
 * Both absent means a non-browser client (curl, native app, calendar fetcher),
 * which cannot be induced to carry someone else's cookie and so isn't the
 * threat model.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Prefixes that authenticate with a token rather than a cookie, and whose
 * callers are not browsers. A cookie-based forgery gains nothing against
 * them, and enforcing origin here would break real clients (the BGA bridge
 * userscript, external calendar apps).
 */
const EXEMPT_PREFIXES = ["/api/bga-ingest", "/api/ical"];

export const requireTrustedOrigin: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method.toUpperCase())) return next();

  const path = new URL(c.req.url).pathname;
  if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();

  const site = c.req.header("sec-fetch-site");
  if (site === "cross-site") {
    return c.json({ error: "forbidden", code: "cross_site_request" }, 403);
  }

  if (!isTrustedOrigin(c.req.header("origin"))) {
    return c.json({ error: "forbidden", code: "untrusted_origin" }, 403);
  }

  return next();
};
