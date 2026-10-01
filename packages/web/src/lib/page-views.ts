// Page-view beacon — tells the server which surfaces the user looked at
// (calendar, a night's card, the games catalog, a greeting card, …) so the
// admin activity trail shows navigation, not just mutations.
//
// Fire-and-forget by design: a failed beacon must never surface to the user
// or retry (activity logging is best-effort, mirroring the server side).
//
// Repeats: this module only drops a BURST — the same page+detail as the last
// beacon, again within ten seconds: a re-render, a StrictMode double effect,
// or two reporters of one look (the calendar's `?date=` route and the night
// card it opens) — never a real second look. Genuine returns ("home → catalog → home") are all
// logged; the route tracker skips re-reports of the route it is already on,
// and the admin drawer folds runs of identical lines into one "×N" line.
//
// Order: every activity request from this tab goes through ONE serial queue.
// The server stamps each event as it handles the request (migration 0047), so
// sending them one at a time is what makes the stamps follow the order things
// happened here — a greeting's "followed" ack before the page it opened.

import { OkResponseSchema, PageViewBodySchema, type PageViewPage } from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch";

const BURST_MS = 10_000;
let last: { key: string; at: number } | null = null;

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

export interface PageViewOptions {
  /** What opened this surface, e.g. `greetingVia("spotlight")`. */
  via?: string;
}

export function reportPageView(
  page: PageViewPage,
  detail?: string,
  options: PageViewOptions = {},
): void {
  const key = detail ? `${page}:${detail}` : page;
  const now = Date.now();
  if (last !== null && last.key === key && now - last.at < BURST_MS) return;
  last = { key, at: now };

  const { via } = options;
  void queueActivity(() =>
    apiFetch("/api/activity/view", {
      method: "POST",
      body: { page, ...(detail ? { detail } : {}), ...(via ? { via } : {}) },
      request: PageViewBodySchema,
      response: OkResponseSchema,
    }),
  ).catch(() => {
    // Best-effort: a lost view is not worth a retry.
  });
}

/**
 * Router state for a navigation whose destination should carry a `via` —
 * `navigate(to, { state: activityNavState(greetingVia("spotlight")) })`.
 * `PageViewTracker` reads it back with `viaFromNavState`.
 */
export function activityNavState(via: string): { activityVia: string } {
  return { activityVia: via };
}

export function viaFromNavState(state: unknown): string | undefined {
  if (state === null || typeof state !== "object" || !("activityVia" in state)) return undefined;
  return typeof state.activityVia === "string" ? state.activityVia : undefined;
}

/**
 * Router state for a URL tidy-up that is not a new look — the calendar
 * stripping its `?date=` deep link once the night's card is open. The route
 * tracker skips it (and remembers the new route, so nothing is re-reported).
 */
export function quietNavState(): { activityQuiet: true } {
  return { activityQuiet: true };
}

export function isQuietNavState(state: unknown): boolean {
  return state !== null && typeof state === "object" && "activityQuiet" in state;
}

/** Forget the burst guard — tests only. */
export function resetPageViewBurst(): void {
  last = null;
}
