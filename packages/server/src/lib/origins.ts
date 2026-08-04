/**
 * The single source of truth for "which origins do we trust".
 *
 * This logic previously existed in three hand-copied variants (`server.ts`,
 * `auth/config.ts`, `auth/reset-link.ts`), which is how the CORS allowlist and
 * better-auth's `trustedOrigins` could silently drift apart.
 */

/** `example.com` → `https://example.com`; trailing slashes removed. */
export function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Origins from `WEB_ORIGIN` (comma separated), normalized. */
export function webOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? "").split(",").map(normalizeOrigin).filter(Boolean);
}

const LOCAL_ORIGINS = ["http://localhost:5173", "http://localhost:3001", "http://127.0.0.1:5173"];

/**
 * Whether the loopback dev origins belong in the allowlist.
 *
 * They are NOT harmless on a public server: with `SameSite=None` cookies,
 * anything a member runs on `localhost:5173` gets credentialed access to the
 * live API.
 *
 * The test is "am I a DEPLOYED server", not `NODE_ENV !== "production"` —
 * because this repo's local `packages/server/.env` sets `NODE_ENV=production`
 * (it talks to the production database), so keying off NODE_ENV would lock
 * developers out of their own dev server.
 *
 * Caveat, deliberately fail-open: a deployment somewhere OTHER than Railway
 * won't be detected and would keep the loopback origins. Set
 * `ALLOW_LOCALHOST_ORIGINS=0` explicitly on any such host.
 */
function isDeployedServer(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_GIT_COMMIT_SHA);
}

function allowLocalhost(): boolean {
  if (process.env.ALLOW_LOCALHOST_ORIGINS === "1") return true;
  if (process.env.ALLOW_LOCALHOST_ORIGINS === "0") return false;
  return !isDeployedServer();
}

/** Exact-match allowlist. No wildcards, no regex, no origin reflection. */
export function allowedOrigins(): string[] {
  return [...(allowLocalhost() ? LOCAL_ORIGINS : []), ...webOrigins()];
}

/**
 * Is this `Origin` header trusted?
 *
 * A MISSING origin is trusted: non-browser clients (calendar fetchers, the
 * BGA userscript, curl, native apps) do not send one, and they are not the
 * threat model here — cross-site requests from a browser are, and browsers
 * always attach `Origin` to those.
 */
export function isTrustedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return true;
  return allowedOrigins().includes(origin);
}
