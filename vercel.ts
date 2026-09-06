// Vercel project configuration (replaces vercel.json).
//
// This file is FOLDED, not executed: the platform reads the exported object
// statically at build time, so it may contain literals and `process.env.X`
// references and nothing else — a computed value is silently dropped, which
// fails schema validation ("rewrites[0] missing required property
// destination" is what a ternary here produced).
//
// The reason the file exists at all: the `/api/*` rewrite must not point
// every deployment at the production backend. It used to, so every pull-
// request preview read and wrote the live database with real member
// sessions. The origin now comes from `API_ORIGIN`, which Vercel scopes per
// environment:
//
//   Production → https://boardgamesserver-production.up.railway.app
//   Preview    → an unresolvable `.invalid` host until a staging backend
//                exists; then that backend's URL. A preview whose API is
//                down is safe; a preview on production is not.
//
// WebSockets cannot be rewritten; the web client picks its socket origin per
// environment on its own (`packages/web/src/lib/ws-client.ts`,
// `VITE_WS_URL_PREVIEW`). See docs/database-operations.md.

import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  buildCommand:
    "(git remote add origin https://github.com/IceboxDev/BoardGames.git 2>/dev/null || git remote set-url origin https://github.com/IceboxDev/BoardGames.git) && git lfs install --local && git lfs pull && pnpm --filter @boardgames/web... build",
  installCommand: "pnpm install --frozen-lockfile --filter @boardgames/web... --ignore-scripts",
  outputDirectory: "packages/web/dist",
  framework: null,
  rewrites: [
    { source: "/api/:path*", destination: `${process.env.API_ORIGIN}/api/:path*` },
    { source: "/(.*)", destination: "/index.html" },
  ],
};
