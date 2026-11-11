import {
  HIBERNATED_CODE,
  type Memorial,
  MemorialPreviewResponseSchema,
  SiteLogResponseSchema,
  type SiteStatus,
  SiteStatusSchema,
} from "@boardgames/core/protocol";
import { ApiError, apiFetch } from "./api-fetch.ts";

// Site hibernation (server: lib/site-state.ts, auth/hibernation-gate.ts).

export function fetchSiteStatus(signal?: AbortSignal): Promise<SiteStatus> {
  return apiFetch("/api/site/status", { response: SiteStatusSchema, signal });
}

export function adminFetchSiteLog(signal?: AbortSignal) {
  return apiFetch("/api/admin/site/log", { response: SiteLogResponseSchema, signal });
}

export async function adminFetchMemorialPreview(signal?: AbortSignal): Promise<Memorial> {
  const { memorial } = await apiFetch("/api/admin/site/preview", {
    response: MemorialPreviewResponseSchema,
    signal,
  });
  return memorial;
}

export function adminHibernate(): Promise<SiteStatus> {
  return apiFetch("/api/admin/site/hibernate", {
    method: "POST",
    body: { confirm: "HIBERNATE" },
    response: SiteStatusSchema,
  });
}

export function adminWake(): Promise<SiteStatus> {
  return apiFetch("/api/admin/site/wake", { method: "POST", response: SiteStatusSchema });
}

/** A request the hibernation gate turned away: the site went to sleep. */
export function isHibernatedError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 503 && err.code === HIBERNATED_CODE;
}

// ── What stays reachable while the site sleeps ─────────────────────────

/** The online area: the `online` route group in App.tsx. */
const ONLINE_PREFIXES = ["/games", "/play/", "/trainer/", "/go/review"];

/** Whether a path renders normally while hibernated, for this viewer. Every
 *  other path shows the goodbye screen. `/login` stays reachable by typed
 *  URL (nothing links to it) so the admin can always get back in. */
export function openWhileHibernated(pathname: string, status: SiteStatus): boolean {
  if (pathname === "/login" || pathname === "/reset-password") return true;
  if (status.admin && (pathname === "/admin" || pathname.startsWith("/admin/"))) return true;
  if (!status.onlineAccess) return false;
  return ONLINE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}
