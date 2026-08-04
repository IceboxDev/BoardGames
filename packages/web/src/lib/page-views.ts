// Page-view beacon — tells the server which surfaces the user looked at
// (calendar, a night's card, the games catalog, …) so the admin activity
// trail can show navigation, not just mutations.
//
// Fire-and-forget by design: a failed beacon must never surface to the user
// or retry (activity logging is best-effort, mirroring the server side).
// Views are deduplicated per (page, detail) with a re-log window, so a
// user bouncing between routes doesn't flood the trail.

import { OkResponseSchema, PageViewBodySchema } from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch";

const RELOG_WINDOW_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();

export function reportPageView(page: string, detail?: string): void {
  const key = detail ? `${page}:${detail}` : page;
  const now = Date.now();
  const last = lastSent.get(key);
  if (last !== undefined && now - last < RELOG_WINDOW_MS) return;
  lastSent.set(key, now);

  void apiFetch("/api/activity/view", {
    method: "POST",
    body: detail ? { page, detail } : { page },
    request: PageViewBodySchema,
    response: OkResponseSchema,
  }).catch(() => {
    // Best-effort: allow a retry on the next visit to this surface.
    lastSent.delete(key);
  });
}
