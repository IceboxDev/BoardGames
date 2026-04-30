# Cross-origin auth: current state and migration plan

Snapshot of the conversation we had on 2026-04-30 about how to handle
cross-site cookies between the Vercel-hosted frontend and the Railway-hosted
backend. We're not doing the migration yet — this doc captures the options so
we can come back to it.

---

## The problem we ran into

- **Frontend**: `boardgames-server.vercel.app` (Vercel)
- **Backend**: `boardgamesserver-production.up.railway.app` (Railway)

Two different origins. Better-auth issues a session cookie from the backend.
Even with `sameSite=none; secure`, cross-site cookies get dropped or partitioned
by Brave, Safari (ITP), and Edge in strict-tracking-prevention mode → users
can't stay signed in.

## The current workaround (live in `vercel.json`)

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://boardgamesserver-production.up.railway.app/api/:path*"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Vercel rewrites every `/api/*` request server-side to Railway. From the
browser's perspective the API lives on the same origin as the frontend, so the
cookie stays first-party.

**Pros**: works, zero browser-specific drama, no infra changes.
**Cons / "why it feels hacky"**:
- Extra network hop through Vercel's edge (latency)
- Vercel egress bandwidth billed twice (in + out)
- Vercel's request timeout becomes a backend constraint (60s default on hobby)
- WebSockets / SSE need separate special handling
- Vercel availability now gates backend availability

It's a legitimate production pattern — many real apps do exactly this — but
it's not the *cleanest* answer.

---

## The textbook fix: subdomain sharing under one registrable domain

Buy a domain (~$12/yr). Run both halves of the stack as subdomains of it:

| Subdomain | Provider | DNS |
|---|---|---|
| `app.bgames.dev` (or apex) | Vercel | CNAME → `cname.vercel-dns.com` |
| `api.bgames.dev` | Railway | CNAME → Railway public URL |

Set the auth cookie with `Domain=.bgames.dev`. Browsers treat both subdomains
as **first-party** because they share the same eTLD+1, so cookies work natively
with `sameSite=lax` — no `none`, no proxy, no exceptions. This is what Stripe,
Linear, Vercel itself, Supabase, Notion, and GitHub all do internally.

### Concrete migration steps (when we're ready)

1. **Buy a domain** and verify DNS works.
2. **Vercel domains UI**: add `app.<domain>` (or apex). Vercel hands you a
   CNAME / A record to set.
3. **Railway**: add a custom domain `api.<domain>` to the server service.
   Railway issues a CNAME target.
4. **Set DNS** at the registrar:
   - `app.<domain>` → Vercel CNAME
   - `api.<domain>` → Railway CNAME
5. **Edit `packages/server/src/auth.ts`** — set the cookie domain:
   ```ts
   advanced: {
     defaultCookieAttributes: {
       sameSite: "lax",          // back to lax — same-site now
       secure: true,
       httpOnly: true,
       domain: ".<domain>",
     },
   }
   ```
6. **Edit `packages/server/.env`** (Railway env in prod):
   ```
   BETTER_AUTH_URL=https://api.<domain>
   WEB_ORIGIN=https://app.<domain>
   ```
7. **Edit `packages/web` build env** on Vercel:
   ```
   VITE_API_BASE_URL=https://api.<domain>
   ```
   This makes `lib/api-base.ts` emit absolute URLs to the API subdomain
   instead of relative paths.
8. **Delete the Vercel rewrite** for `/api/*` from `vercel.json` (keep the
   SPA catch-all).
9. **Verify**: sign in on `app.<domain>`, confirm cookie set on
   `.<domain>`, refresh, navigate around — sessions persist on Brave / Safari
   / Edge / Firefox.

After this:
- One unified auth surface under one registrable domain
- First-party cookies, every browser respects them
- No proxy hop
- WebSockets work natively (no edge special-casing)
- Independent scaling — Vercel for static, Railway for stateful API
- CORS becomes trivial

---

## Other patterns we considered

For reference / completeness — not what we'd do for this project, but worth
knowing they exist:

### Backend-for-Frontend (BFF)
A thin server layer next to the frontend (Next.js API routes, a Cloudflare
Worker) holds tokens server-side and forwards cleaned requests to the real
backend. Used by enterprise SaaS (Salesforce, Atlassian, Spotify). More code,
another deployable.

### Token-in-header (no cookies)
Frontend stores a short-lived access token in memory and sends
`Authorization: Bearer …` on every request. CORS is simple, sameSite is
irrelevant. Tradeoffs: vulnerable to XSS (any bad script reads the token),
logout / revocation is harder, server-rendered pages are tricky. What most
"API-first" platforms (Auth0, Clerk headless) use.

### Dual-token (refresh cookie + access token in memory)
- Short-lived access token in memory, sent in `Authorization` header
- Long-lived refresh token in HttpOnly cookie scoped to `/auth/refresh`
- On 401, frontend hits `/auth/refresh`, gets a new access token

Default model for Auth0, Clerk, modern Supabase. The refresh cookie still has
the cross-site problem unless combined with subdomain sharing — so this is
really an enhancement on top of #1 above, not an alternative.

### Same-origin via platform-native backend
Move the backend onto the same platform/domain as the frontend (Next.js
fullstack on Vercel, Remix on Cloudflare). The cross-origin problem
disappears entirely. Tradeoff: harder to scale stateful services on
serverless edge; tied to one platform.

### Cookie partitioning / CHIPS
`Partitioned` cookie attribute (Chrome 118+, Safari 17+) — for embedded
widgets / iframes. Doesn't help our use case.

---

## Recommendation summary

**Short term**: keep the Vercel rewrite. It works, browsers are happy.

**Medium term** (when buying a domain feels worthwhile): migrate to
subdomain sharing per the steps above. That's the cleanest production setup
for our split (Vercel + Railway) and removes the proxy hop, the egress
double-billing, and the WebSocket awkwardness.

**Long term, if we ever outgrow this**: revisit the dual-token pattern on
top of subdomain sharing — for native mobile clients or fine-grained
revocation.
