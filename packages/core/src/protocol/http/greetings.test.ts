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

  it("parses an arrival greeting (union composition with arrivals.ts)", () => {
    const parsed = AppGreetingSchema.parse({
      kind: "arrival",
      arrivalId: "a1",
      pollId: 1,
      publishedAt: "2026-09-10 12:00:00",
      games: [
        {
          slug: "wingspan",
          purchaser: { id: "u1", name: "Mantas", image: null, accentHex: null },
          votes: 5,
          voters: [{ image: null, accentHex: "#d36830" }],
          photoUrl: "/api/arrivals/a1/photos/wingspan",
          placeholder: "data:image/webp;base64,UklGRiIAAABXRUJQVlA4",
          width: 1280,
          height: 1600,
        },
      ],
      totals: { voterCount: 5, votesCast: 9 },
    });
    expect(parsed.kind).toBe("arrival");
  });

  it("no longer accepts the retired purchase-vote result kind", () => {
    const r = AppGreetingSchema.safeParse({
      kind: "purchase-vote-result",
      pollId: 1,
      winnerSlug: "wingspan",
      tally: [{ slug: "wingspan", votes: 5 }],
    });
    expect(r.success).toBe(false);
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
  it("accepts every kind with a response action", () => {
    for (const body of [
      { kind: "purchase-vote-announce", pollId: 2, action: "cta" },
      { kind: "purchase-vote-reminder", pollId: 2, action: "later" },
      { kind: "arrival", arrivalId: "a1", action: "later" },
      { kind: "skill-intro", action: "cta" },
      { kind: "spotlight", id: 4, action: "later" },
    ]) {
      expect(() => AppGreetingAckBodySchema.parse(body)).not.toThrow();
    }
  });

  it("rejects an ack without a response action", () => {
    const r = AppGreetingAckBodySchema.safeParse({ kind: "skill-intro" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["action"]);
  });

  it("rejects an arrival ack without an arrival id", () => {
    const r = AppGreetingAckBodySchema.safeParse({ kind: "arrival", action: "cta" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["arrivalId"]);
  });

  it("rejects a vote ack without a poll id", () => {
    const r = AppGreetingAckBodySchema.safeParse({
      kind: "purchase-vote-announce",
      action: "later",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["pollId"]);
  });
});
