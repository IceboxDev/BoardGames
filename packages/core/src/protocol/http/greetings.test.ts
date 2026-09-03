import { describe, expect, it } from "vitest";
import {
  AppGreetingAckBodySchema,
  AppGreetingResponseSchema,
  AppGreetingSchema,
} from "./greetings.ts";

describe("AppGreetingSchema", () => {
  it("parses a purchase-vote announce greeting", () => {
    const parsed = AppGreetingSchema.parse({
      kind: "purchase-vote-announce",
      pollId: 1,
      candidates: ["arcs", "wingspan"],
      voterCount: 2,
      requiredVoters: 6,
    });
    expect(parsed.kind).toBe("purchase-vote-announce");
  });

  it("parses a purchase-vote reminder greeting and rejects votesLeft 0", () => {
    expect(() =>
      AppGreetingSchema.parse({
        kind: "purchase-vote-reminder",
        pollId: 1,
        votesLeft: 2,
        voterCount: 2,
        requiredVoters: 6,
      }),
    ).not.toThrow();
    const r = AppGreetingSchema.safeParse({
      kind: "purchase-vote-reminder",
      pollId: 1,
      votesLeft: 0,
      voterCount: 2,
      requiredVoters: 6,
    });
    expect(r.success).toBe(false);
  });

  it("parses a purchase-vote result greeting", () => {
    const parsed = AppGreetingSchema.parse({
      kind: "purchase-vote-result",
      pollId: 1,
      winnerSlug: "wingspan",
      tally: [{ slug: "wingspan", votes: 5 }],
    });
    expect(parsed.kind).toBe("purchase-vote-result");
  });

  it("still parses the existing skill-intro kind (union composition)", () => {
    const parsed = AppGreetingSchema.parse({
      kind: "skill-intro",
      highlight: { kind: "trait-first", trait: "int" },
    });
    expect(parsed.kind).toBe("skill-intro");
  });

  it("rejects an unknown kind", () => {
    const r = AppGreetingSchema.safeParse({ kind: "confetti-cannon" });
    expect(r.success).toBe(false);
  });
});

describe("AppGreetingResponseSchema", () => {
  it("parses a null greeting with an empty players map", () => {
    const parsed = AppGreetingResponseSchema.parse({ greeting: null, players: {} });
    expect(parsed.greeting).toBeNull();
  });
});

describe("AppGreetingAckBodySchema", () => {
  it("accepts vote acks and the legacy skill acks", () => {
    expect(() =>
      AppGreetingAckBodySchema.parse({ kind: "purchase-vote-announce", pollId: 2 }),
    ).not.toThrow();
    expect(() =>
      AppGreetingAckBodySchema.parse({ kind: "purchase-vote-result", pollId: 2 }),
    ).not.toThrow();
    expect(() => AppGreetingAckBodySchema.parse({ kind: "skill-intro" })).not.toThrow();
    expect(() => AppGreetingAckBodySchema.parse({ kind: "spotlight", id: 4 })).not.toThrow();
  });

  it("rejects a reminder ack — the reminder has no ack arm by design", () => {
    const r = AppGreetingAckBodySchema.safeParse({ kind: "purchase-vote-reminder", pollId: 2 });
    expect(r.success).toBe(false);
  });

  it("rejects a vote ack without a poll id", () => {
    const r = AppGreetingAckBodySchema.safeParse({ kind: "purchase-vote-announce" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["pollId"]);
  });
});
