import {
  type AppGreetingAckBody,
  AppGreetingAckBodySchema,
  AppGreetingAckResponseSchema,
  type AppGreetingResponse,
  AppGreetingResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";
import { queueActivity } from "./page-views.ts";

/** The one takeover popup this viewer still owes a look at, if any. */
export async function fetchGreeting(signal?: AbortSignal): Promise<AppGreetingResponse> {
  return apiFetch("/api/greetings", { response: AppGreetingResponseSchema, signal });
}

/**
 * Acks share the page-view queue: a "followed" ack must reach the server
 * before the page view of the screen the button opened, or the activity
 * trail shows them backwards.
 */
export async function ackGreeting(body: AppGreetingAckBody): Promise<void> {
  await queueActivity(() =>
    apiFetch("/api/greetings/ack", {
      method: "POST",
      request: AppGreetingAckBodySchema,
      body,
      response: AppGreetingAckResponseSchema,
    }),
  );
}
