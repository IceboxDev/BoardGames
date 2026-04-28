/**
 * Base URL of the API server. Empty in dev (Vite proxies `/api/*` to the
 * Hono server), populated in prod (Vercel build sets `VITE_API_BASE_URL`
 * to the Railway server's public origin, e.g. `https://app.up.railway.app`).
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
