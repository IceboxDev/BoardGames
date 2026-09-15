import type { AppGreeting } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { ackBody, greetingKey } from "./greeting-ack";

const arrival: AppGreeting = {
  kind: "arrival",
  arrivalId: "a7",
  pollId: 3,
  publishedAt: "2026-09-10 12:00:00",
  games: [],
  totals: { voterCount: 0, votesCast: 0 },
} as unknown as AppGreeting;

describe("greetingKey", () => {
  it("keys every kind by its own identity", () => {
    expect(
      greetingKey({ kind: "skill-intro", highlight: { kind: "trait-first", trait: "int" } }),
    ).toBe("skill-intro");
    expect(
      greetingKey({
        kind: "purchase-vote-announce",
        pollId: 2,
        candidates: ["arcs"],
        voterCount: 0,
        requiredVoters: 1,
      }),
    ).toBe("pv-announce:2");
    expect(
      greetingKey({
        kind: "purchase-vote-reminder",
        pollId: 2,
        votesLeft: 1,
        voterCount: 0,
        requiredVoters: 1,
      }),
    ).toBe("pv-reminder:2");
    expect(greetingKey(arrival)).toBe("arrival:a7");
    expect(greetingKey(invite)).toBe("night-invite:2026-10-03");
  });
});

const invite: AppGreeting = {
  kind: "night-invite",
  date: "2026-10-03",
  hostUserId: "u-host",
  title: null,
  eventTime: null,
  seats: { total: 5, taken: 1, waitlisted: 0 },
  pickMode: "host",
} as unknown as AppGreeting;

describe("ackBody", () => {
  it("carries the night's date on invite acks", () => {
    expect(ackBody(invite, "cta")).toEqual({
      kind: "night-invite",
      date: "2026-10-03",
      action: "cta",
    });
  });

  it("carries the arrival id and the response", () => {
    expect(ackBody(arrival, "cta")).toEqual({ kind: "arrival", arrivalId: "a7", action: "cta" });
    expect(ackBody(arrival, "later")).toEqual({
      kind: "arrival",
      arrivalId: "a7",
      action: "later",
    });
  });

  it("keeps the poll id on vote acks", () => {
    expect(
      ackBody(
        {
          kind: "purchase-vote-announce",
          pollId: 5,
          candidates: ["arcs"],
          voterCount: 0,
          requiredVoters: 1,
        },
        "later",
      ),
    ).toEqual({ kind: "purchase-vote-announce", pollId: 5, action: "later" });
  });
});
