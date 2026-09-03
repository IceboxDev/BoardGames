import { describe, expect, it } from "vitest";
import {
  AdminCreatePollBodySchema,
  PurchasePollSchema,
  PurchaseVoteStateSchema,
  SetPurchaseVotesBodySchema,
  VOTES_PER_PLAYER,
} from "./purchase-vote.ts";

describe("PurchaseVoteStateSchema", () => {
  it("parses an open poll with hidden results", () => {
    const parsed = PurchaseVoteStateSchema.parse({
      poll: {
        id: 1,
        candidates: ["arcs", "wingspan", "spirit-island"],
        requiredVoters: 5,
        voterCount: 2,
        myVotes: ["arcs"],
        votesLeft: 2,
        closedAt: null,
        winnerSlug: null,
        results: null,
      },
    });
    expect(parsed.poll?.votesLeft).toBe(2);
    expect(parsed.poll?.results).toBeNull();
  });

  it("parses a closed poll with revealed tally, tolerating retired slugs", () => {
    const parsed = PurchaseVoteStateSchema.parse({
      poll: {
        id: 3,
        candidates: ["some-retired-slug", "wingspan"],
        requiredVoters: 2,
        voterCount: 2,
        myVotes: [],
        votesLeft: VOTES_PER_PLAYER,
        closedAt: "2026-09-03 01:00:00",
        winnerSlug: "wingspan",
        results: {
          tally: [
            { slug: "wingspan", votes: 4 },
            { slug: "some-retired-slug", votes: 1 },
          ],
        },
      },
    });
    expect(parsed.poll?.winnerSlug).toBe("wingspan");
  });

  it("parses the no-poll state", () => {
    expect(PurchaseVoteStateSchema.parse({ poll: null }).poll).toBeNull();
  });

  it("rejects more picks than the vote budget", () => {
    const r = PurchasePollSchema.safeParse({
      id: 1,
      candidates: ["arcs"],
      requiredVoters: 1,
      voterCount: 1,
      myVotes: ["a", "b", "c", "d"],
      votesLeft: 0,
      closedAt: null,
      winnerSlug: null,
      results: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["myVotes"]);
  });
});

describe("SetPurchaseVotesBodySchema", () => {
  it("accepts up to three distinct slugs (empty allowed — clearing votes)", () => {
    expect(() =>
      SetPurchaseVotesBodySchema.parse({ slugs: ["arcs", "wingspan", "container"] }),
    ).not.toThrow();
    expect(() => SetPurchaseVotesBodySchema.parse({ slugs: [] })).not.toThrow();
  });

  it("rejects more slugs than the vote budget", () => {
    const r = SetPurchaseVotesBodySchema.safeParse({
      slugs: ["a", "b", "c", "d"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate slugs", () => {
    const r = SetPurchaseVotesBodySchema.safeParse({ slugs: ["arcs", "arcs"] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["slugs", 1]);
  });

  it("rejects a malformed slug", () => {
    const r = SetPurchaseVotesBodySchema.safeParse({ slugs: ["Not A Slug!"] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["slugs", 0]);
  });
});

describe("AdminCreatePollBodySchema", () => {
  it("accepts a real candidate list", () => {
    expect(() =>
      AdminCreatePollBodySchema.parse({
        candidates: ["arcs", "wingspan", "spirit-island"],
        requiredVoters: 5,
      }),
    ).not.toThrow();
  });

  it("rejects a slug that is not in the catalog", () => {
    const r = AdminCreatePollBodySchema.safeParse({
      candidates: ["arcs", "definitely-not-a-catalog-game"],
      requiredVoters: 5,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["candidates", 1]);
  });

  it("rejects duplicate candidates", () => {
    const r = AdminCreatePollBodySchema.safeParse({
      candidates: ["arcs", "arcs"],
      requiredVoters: 2,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["candidates", 1]);
  });

  it("rejects a single-candidate poll and a zero threshold", () => {
    expect(
      AdminCreatePollBodySchema.safeParse({ candidates: ["arcs"], requiredVoters: 2 }).success,
    ).toBe(false);
    expect(
      AdminCreatePollBodySchema.safeParse({ candidates: ["arcs", "wingspan"], requiredVoters: 0 })
        .success,
    ).toBe(false);
  });
});
