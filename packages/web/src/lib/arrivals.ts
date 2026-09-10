import {
  AdminArrivalsStateSchema,
  PublishArrivalBodySchema,
  PublishArrivalResponseSchema,
  RetractArrivalResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";
import { jsonMutation, jsonQuery } from "./typed-query.ts";

// Admin side of arrivals: the closed polls to announce from, the published
// announcements, and the publish / retract writes. The member-facing popup
// arrives through the greeting queue (`lib/greetings.ts`), not from here.

export const fetchAdminArrivals = jsonQuery("/api/admin/arrivals", AdminArrivalsStateSchema);

export const publishArrival = jsonMutation("/api/admin/arrivals", {
  request: PublishArrivalBodySchema,
  response: PublishArrivalResponseSchema,
});

/** Hard delete: the popup stops for members who haven't seen it; inventories
 * stay as they are (a set-add cannot be safely reversed). */
export async function retractArrival(id: string): Promise<void> {
  await apiFetch(`/api/admin/arrivals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    response: RetractArrivalResponseSchema,
  });
}
