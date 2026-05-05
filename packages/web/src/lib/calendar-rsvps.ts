import {
  ClearRsvpBodySchema,
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
