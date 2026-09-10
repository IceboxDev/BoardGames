// Page-view beacon — tells the server which surfaces the user looked at
// (calendar, a night's card, the games catalog, …) so the admin activity
// trail can show navigation, not just mutations.
//
// Fire-and-forget by design: a failed beacon must never surface to the user
// or retry (activity logging is best-effort, mirroring the server side).
// Views are deduplicated per (page, detail) with a re-log window, so a
// user bouncing between routes doesn't flood the trail.
//
// Every activity request from this tab goes through ONE serial queue. The
// trail is ordered by database insertion, so two concurrent requests (a
// greeting's "followed" ack and the page view of the screen it opened) used
// to land in whichever order the network delivered them — and the trail
// then showed the screen opening before the button that opened it.

import { OkResponseSchema, PageViewBodySchema } from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch";

const RELOG_WINDOW_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();

let chain: Promise<unknown> = Promise.resolve();

/**
 * Run `send` after every previously queued activity request has settled, so
 * the server receives activity in the order it happened here. Rejections
 * propagate to the caller but never block the queue.
 */
export function queueActivity<T>(send: () => Promise<T>): Promise<T> {
  const next = chain.then(send, send);
  chain = next.catch(() => undefined);
  return next;
}

export function reportPageView(page: string, detail?: string): void {
  const key = detail ? `${page}:${detail}` : page;
  const now = Date.now();
  const last = lastSent.get(key);
  if (last !== undefined && now - last < RELOG_WINDOW_MS) return;
  lastSent.set(key, now);

  void queueActivity(() =>
    apiFetch("/api/activity/view", {
      method: "POST",
      body: detail ? { page, detail } : { page },
      request: PageViewBodySchema,
      response: OkResponseSchema,
    }),
  ).catch(() => {
    // Best-effort: allow a retry on the next visit to this surface.
    lastSent.delete(key);
  });
}
