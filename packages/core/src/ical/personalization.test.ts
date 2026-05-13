import { describe, expect, it } from "vitest";
import { buildSummary, deriveSummaryPrefix, type SummaryPrefixInput } from "./personalization.ts";

function base(over: Partial<SummaryPrefixInput> = {}): SummaryPrefixInput {
  return {
    expectedUserIds: ["u1"],
    picksLockedAt: null,
    viewerId: "u1",
    viewerRsvp: "yes",
    viewerManuallyRsvped: true,
    viewerHyped: true,
    viewerBringing: [],
    ...over,
  };
}

describe("deriveSummaryPrefix priority order", () => {
  it("returns [Not going] when the viewer declined", () => {
    expect(deriveSummaryPrefix(base({ viewerRsvp: "no" }))).toBe("[Not going]");
  });

  it("[Not going] wins over a bring-list (decline trumps assignment)", () => {
    expect(
      deriveSummaryPrefix(
        base({
          viewerRsvp: "no",
          picksLockedAt: "2026-05-12 19:00:00",
          viewerBringing: ["Wingspan", "Ark Nova"],
        }),
      ),
    ).toBe("[Not going]");
  });

  it("returns [RSVP!] for an expected user with no manual yes", () => {
    expect(
      deriveSummaryPrefix(
        base({
          expectedUserIds: ["u1"],
          viewerRsvp: undefined,
          viewerManuallyRsvped: false,
        }),
      ),
    ).toBe("[RSVP!]");
  });

  it("returns [RSVP!] when the viewer's row is an auto-yes (manuallyRsvped=false)", () => {
    expect(
      deriveSummaryPrefix(
        base({
          // auto-yes case: lock-time batch set rsvp=yes but the user never
          // clicked. Surface as RSVP! so the user knows to confirm.
          expectedUserIds: ["u1"],
          viewerRsvp: undefined,
          viewerManuallyRsvped: false,
        }),
      ),
    ).toBe("[RSVP!]");
  });

  it("returns [Vote?] when a definite attendee hasn't hyped anything and picks aren't locked", () => {
    expect(
      deriveSummaryPrefix(
        base({
          picksLockedAt: null,
          viewerHyped: false,
        }),
      ),
    ).toBe("[Vote?]");
  });

  it("returns [Bring: …] when picks are locked and the viewer has assignments", () => {
    expect(
      deriveSummaryPrefix(
        base({
          picksLockedAt: "2026-05-12 19:00:00",
          viewerBringing: ["Wingspan", "Ark Nova"],
        }),
      ),
    ).toBe("[Bring: Wingspan, Ark Nova]");
  });

  it("truncates the Bring list at 3 with a +N tail", () => {
    expect(
      deriveSummaryPrefix(
        base({
          picksLockedAt: "2026-05-12 19:00:00",
          viewerBringing: ["A", "B", "C", "D", "E"],
        }),
      ),
    ).toBe("[Bring: A, B, C +2]");
  });

  it("returns '' when nothing is pressing", () => {
    expect(
      deriveSummaryPrefix(
        base({
          // Picks locked, no assignment, already RSVPed → quiet title.
          picksLockedAt: "2026-05-12 19:00:00",
          viewerBringing: [],
        }),
      ),
    ).toBe("");
  });

  it("returns '' for a viewer who has nothing to do — not in expected, no rsvp, no votes", () => {
    expect(
      deriveSummaryPrefix(
        base({
          expectedUserIds: [],
          viewerRsvp: undefined,
          viewerManuallyRsvped: false,
          viewerHyped: false,
          viewerBringing: [],
        }),
      ),
    ).toBe("");
  });
});

describe("buildSummary", () => {
  it("appends the host name when present", () => {
    expect(buildSummary("[Vote?]", "Alice")).toBe("[Vote?] Game Night — Host Alice");
  });

  it("omits host suffix when host is null", () => {
    expect(buildSummary("[Vote?]", null)).toBe("[Vote?] Game Night");
  });

  it("omits prefix entirely when empty", () => {
    expect(buildSummary("", "Alice")).toBe("Game Night — Host Alice");
    expect(buildSummary("", null)).toBe("Game Night");
  });
});
