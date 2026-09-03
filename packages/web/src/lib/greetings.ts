import {
  type AppGreetingAckBody,
  AppGreetingAckBodySchema,
  AppGreetingAckResponseSchema,
  type AppGreetingResponse,
  AppGreetingResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

/** The one takeover popup this viewer still owes a look at, if any. */
export async function fetchGreeting(signal?: AbortSignal): Promise<AppGreetingResponse> {
  return apiFetch("/api/greetings", { response: AppGreetingResponseSchema, signal });
}

export async function ackGreeting(body: AppGreetingAckBody): Promise<void> {
  await apiFetch("/api/greetings/ack", {
    method: "POST",
    request: AppGreetingAckBodySchema,
    body,
    response: AppGreetingAckResponseSchema,
  });
}
