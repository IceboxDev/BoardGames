// Client-side bindings for the calendar-sync feature. Status (non-secret)
// drives the modal's three states; generate returns the raw token + ready-
// to-paste subscribe URLs once at mint time. Disconnect is idempotent.

import {
  type CalendarFeedStatus,
  CalendarFeedStatusSchema,
  type CalendarFeedTokenResponse,
  CalendarFeedTokenResponseSchema,
  OkResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export type { CalendarFeedStatus, CalendarFeedTokenResponse };

export async function fetchCalendarFeedStatus(signal?: AbortSignal): Promise<CalendarFeedStatus> {
  return apiFetch("/api/calendar/feed/status", {
    response: CalendarFeedStatusSchema,
    signal,
  });
}

export async function generateCalendarFeedToken(): Promise<CalendarFeedTokenResponse> {
  return apiFetch("/api/calendar/feed/token", {
    method: "POST",
    response: CalendarFeedTokenResponseSchema,
  });
}

export async function disconnectCalendarFeed(): Promise<{ ok: true }> {
  return apiFetch("/api/calendar/feed/token", {
    method: "DELETE",
    response: OkResponseSchema,
  });
}

/**
 * Build the calendar-app deep-links for a given subscribe URL. The Google
 * dialog requires a `webcal://` URL in the `cid` param; Apple takes the
 * `webcal://` URL straight; Outlook (outlook.live.com) takes the `https://`
 * URL plus a name.
 */
export function buildCalendarDeepLinks(opts: { subscribeUrl: string; webcalUrl: string }): {
  google: string;
  apple: string;
  outlook: string;
} {
  return {
    google: `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(opts.webcalUrl)}`,
    apple: opts.webcalUrl,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(
      opts.subscribeUrl,
    )}&name=${encodeURIComponent("Game Nights")}`,
  };
}
