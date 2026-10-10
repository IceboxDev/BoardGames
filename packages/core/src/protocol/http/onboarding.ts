// Onboarding: the welcome tour a new member sees once (delivered as the
// `onboarding` greeting, see greetings.ts) and the first-use hints that
// point at the real controls afterwards. State lives server-side per member
// (`user_onboarding.state_json`), so it follows them across devices.

import { z } from "zod";

/** The first-use hints, in the order a new member usually meets them. */
export const HINT_IDS = [
  "calendar-start",
  "calendar-cycle",
  "night-open",
  "night-rsvp",
  "night-vote",
] as const;
export const HintIdSchema = z.enum(HINT_IDS);
export type HintId = z.infer<typeof HintIdSchema>;

export const OnboardingDeckOutcomeSchema = z.enum(["finished", "skipped"]);
export type OnboardingDeckOutcome = z.infer<typeof OnboardingDeckOutcomeSchema>;

/** How many cards the tour has — `reached` counts from 1. */
export const ONBOARDING_CARDS = 9;

export const OnboardingStateSchema = z.object({
  /** Joined before onboarding existed: no tour, no hints. */
  existingMember: z.boolean().optional(),
  /** The tour, once answered. Unset = not yet shown to completion. */
  deck: z
    .object({
      outcome: OnboardingDeckOutcomeSchema,
      at: z.string(),
      /** The furthest card reached, 1-based. */
      reached: z.number().int().min(1).max(ONBOARDING_CARDS),
    })
    .optional(),
  /** Hints dismissed, with when. */
  hints: z.partialRecord(HintIdSchema, z.string()).default({}),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export const EMPTY_ONBOARDING: OnboardingState = { hints: {} };

/** A stored value that doesn't parse is treated as a fresh state, never an error. */
export function parseOnboardingState(raw: unknown): OnboardingState {
  const r = OnboardingStateSchema.safeParse(raw);
  return r.success ? r.data : EMPTY_ONBOARDING;
}

export const OnboardingResponseSchema = z.object({
  /** Hints still to show, in order. Empty until the tour is answered. */
  hintsDue: z.array(HintIdSchema),
});
export type OnboardingResponse = z.infer<typeof OnboardingResponseSchema>;

export const MarkHintSeenBodySchema = z.object({ id: HintIdSchema });
