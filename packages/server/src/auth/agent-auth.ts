import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";

// ── Agent authentication (vestauth / web-bot-auth) ────────────────────
//
// A second, entirely separate auth path from better-auth sessions: requests
// signed by a vestauth agent identity (RFC 9421 HTTP Message Signatures with
// the web-bot-auth tag). The signature covers the request's @authority (host)
// plus created/expires/keyid/nonce and expires after 300s; verification
// fetches the agent's public key from its
// `agent-<uid>.api.vestauth.com/.well-known/http-message-signatures-directory`
// (so the trust anchor is vestauth's hosted key directory), then pins the
// verified uid against an explicit allowlist.
//
// Fail-closed by design:
//   - VESTAUTH_ALLOWED_AGENT_UIDS unset/empty → every agent route 404s. The
//     feature ships dark; the operator turns it on per environment.
//   - Signature invalid/missing/expired, or Signature-Agent host outside
//     *.api.vestauth.com → 401 (the SDK rejects forged hosts before any
//     network fetch).
//   - Valid signature but uid not in the allowlist → 403.
//
// Because the signature binds only the host (not method/path), a captured
// signature could be replayed against other paths on this host for up to
// 300s — which is why everything mounted behind this middleware MUST stay
// read-only GET endpoints with no side effects.

export type AgentEnv = {
  Variables: {
    /** The verified vestauth agent uid (present after requireAgent). */
    agentUid: string;
  };
};

export const agentApp = () => new Hono<AgentEnv>();

function allowedAgentUids(): string[] {
  return (process.env.VESTAUTH_ALLOWED_AGENT_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type VerifyFn = (
  httpMethod: string,
  uri: string,
  headers: Record<string, string>,
) => Promise<{ uid?: string }>;

// The vestauth SDK is loaded lazily on the first agent request so the (dark
// by default) feature adds nothing to boot time; module is CJS, memoized.
let verifyPromise: Promise<VerifyFn> | null = null;
function loadVerify(): Promise<VerifyFn> {
  if (!verifyPromise) {
    verifyPromise = import("vestauth").then((m) => (m.default ?? m).tool.verify as VerifyFn);
  }
  return verifyPromise;
}

/** Test seam: swap the SDK verifier (pass null to restore the real one). */
export function __setAgentVerifierForTests(fn: VerifyFn | null): void {
  verifyPromise = fn ? Promise.resolve(fn) : null;
}

export const requireAgent: MiddlewareHandler<AgentEnv> = async (c, next) => {
  const allowed = allowedAgentUids();
  // Dark unless explicitly enabled — indistinguishable from a missing route.
  if (allowed.length === 0) return c.json({ error: "not found" }, 404);

  let uid: string | undefined;
  try {
    const verify = await loadVerify();
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    ({ uid } = await verify(c.req.method, c.req.url, headers));
  } catch {
    // Missing/forged/expired signature. No detail on purpose.
    return c.json({ error: "unauthorized" }, 401);
  }
  if (!uid || !allowed.includes(uid)) {
    return c.json({ error: "forbidden" }, 403);
  }
  c.set("agentUid", uid);
  await next();
};
