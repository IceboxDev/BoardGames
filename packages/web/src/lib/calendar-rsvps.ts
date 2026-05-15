import {
  ClearRsvpBodySchema,
  KickRsvpBodySchema,
  OkResponseSchema,
  type RsvpStatus,
  SetRsvpBodySchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

export type { RsvpStatus } from "@boardgames/core/protocol";

/**
 * Record an RSVP. Pass `auto: true` when the call originates from an
 * automated mechanism (e.g. the modal's first-open useEffect) so the
 * server can flag the row and the attendees view keeps showing
 * "Hasn't RSVP'd yet" until the user actually clicks the button.
 */
export async function setRsvp(date: string, status: RsvpStatus, auto = false) {
  return apiFetch("/api/calendar/rsvp", {
    method: "POST",
    body: { date, status, auto },
    request: SetRsvpBodySchema,
    response: OkResponseSchema,
  });
}

export async function clearRsvp(date: string) {
  return apiFetch("/api/calendar/rsvp", {
    method: "DELETE",
    body: { date },
    request: ClearRsvpBodySchema,
    response: OkResponseSchema,
  });
}

/**
 * Host/admin-only: force another user's RSVP for `date` to "no". Backs the X
 * button in the attendees view when someone bows out by text rather than
 * in-app.
 */
export async function kickRsvp(date: string, userId: string) {
  return apiFetch("/api/calendar/rsvp/kick", {
    method: "POST",
    body: { date, userId },
    request: KickRsvpBodySchema,
    response: OkResponseSchema,
  });
}
