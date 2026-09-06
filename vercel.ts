// Vercel project configuration (replaces vercel.json; typed, and able to read
// the build environment).
//
// The one thing vercel.json could not express is the reason this file exists:
// the `/api/*` rewrite must NOT point every deployment at the production
// backend. It used to, so every pull-request preview read and wrote the live
// database with real member sessions. Now:
//
//   production → the production Railway service (unchanged behaviour);
//   preview    → `PREVIEW_API_ORIGIN` (set it in the Vercel project's
//                Preview environment to a staging backend), and when that
//                is unset, a deliberately unresolvable host — a preview
//                whose API is down is safe; a preview on production is not.
//
// WebSockets cannot be rewritten; the web client picks its socket origin
// per environment on its own (`packages/web/src/lib/ws-client.ts`,
// `VITE_WS_URL_PREVIEW`).
//
// Only the type is imported from @vercel/config, so evaluating this file
// needs no runtime dependency.

import type { VercelConfig } from "@vercel/config/v1";

const PRODUCTION_API_ORIGIN = "https://boardgamesserver-production.up.railway.app";
/** `.invalid` is reserved (RFC 2606) and never resolves. */
const NO_PREVIEW_BACKEND = "https://preview-api-not-configured.invalid";

const deployEnv = process.env.VERCEL_ENV ?? "production";
// An empty variable must count as unset: "" would rewrite /api/* onto itself.
const previewOrigin = (process.env.PREVIEW_API_ORIGIN ?? "").trim().replace(/\/+$/, "") || undefined;

const apiOrigin =
  deployEnv === "production" ? PRODUCTION_API_ORIGIN : (previewOrigin ?? NO_PREVIEW_BACKEND);

if (deployEnv !== "production" && !previewOrigin) {
  console.warn(
    `[vercel.ts] ${deployEnv} deployment has no PREVIEW_API_ORIGIN — /api/* will fail closed instead of reaching production`,
  );
}

export const config: VercelConfig = {
  buildCommand:
    "(git remote add origin https://github.com/IceboxDev/BoardGames.git 2>/dev/null || git remote set-url origin https://github.com/IceboxDev/BoardGames.git) && git lfs install --local && git lfs pull && pnpm --filter @boardgames/web... build",
  installCommand: "pnpm install --frozen-lockfile --filter @boardgames/web... --ignore-scripts",
  outputDirectory: "packages/web/dist",
  framework: null,
  rewrites: [
    { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
    { source: "/(.*)", destination: "/index.html" },
  ],
};
