import {
  type HintId,
  MarkHintSeenBodySchema,
  type OnboardingResponse,
  OnboardingResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

/** The first-use hints still due for the viewer (none before the tour is answered). */
export function fetchOnboarding(signal?: AbortSignal): Promise<OnboardingResponse> {
  return apiFetch("/api/onboarding", { response: OnboardingResponseSchema, signal });
}

export function markHintSeen(id: HintId): Promise<OnboardingResponse> {
  return apiFetch("/api/onboarding/hints/seen", {
    method: "POST",
    body: { id },
    request: MarkHintSeenBodySchema,
    response: OnboardingResponseSchema,
  });
}
