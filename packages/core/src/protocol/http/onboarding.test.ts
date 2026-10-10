import { describe, expect, it } from "vitest";
import { AppGreetingAckBodySchema } from "./greetings.ts";
import { MarkHintSeenBodySchema, parseOnboardingState } from "./onboarding.ts";

describe("onboarding protocol", () => {
  it("parses a stored state and defaults the hints", () => {
    expect(parseOnboardingState({ existingMember: true })).toEqual({
      existingMember: true,
      hints: {},
    });
    expect(
      parseOnboardingState({
        deck: { outcome: "finished", at: "2026-10-09T10:00:00.000Z", reached: 9 },
        hints: { "night-rsvp": "2026-10-09T10:05:00.000Z" },
      }).hints,
    ).toEqual({ "night-rsvp": "2026-10-09T10:05:00.000Z" });
  });

  it("treats anything malformed as a fresh state", () => {
    expect(parseOnboardingState(null)).toEqual({ hints: {} });
    expect(parseOnboardingState({ deck: { outcome: "maybe" } })).toEqual({ hints: {} });
  });

  it("accepts only known hints", () => {
    expect(MarkHintSeenBodySchema.safeParse({ id: "night-vote" }).success).toBe(true);
    const bad = MarkHintSeenBodySchema.safeParse({ id: "everything" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.path).toEqual(["id"]);
  });

  it("acks the tour with how far it got", () => {
    expect(
      AppGreetingAckBodySchema.parse({ kind: "onboarding", action: "later", reached: 3 }),
    ).toEqual({ kind: "onboarding", action: "later", reached: 3 });
    expect(
      AppGreetingAckBodySchema.safeParse({ kind: "onboarding", action: "cta", reached: 0 }).success,
    ).toBe(false);
  });
});
