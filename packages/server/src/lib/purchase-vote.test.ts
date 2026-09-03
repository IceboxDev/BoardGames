import { describe, expect, it } from "vitest";
import { computeTally, computeWinner, distinctVoterCount } from "./purchase-vote.ts";

const vote = (user_id: string, slug: string) => ({
  user_id,
  slug,
  created_at: "2026-09-03 01:00:00",
});

describe("computeTally", () => {
  it("counts votes and sorts votes desc, slug asc", () => {
    const tally = computeTally(
      ["arcs", "wingspan", "container"],
      [vote("u1", "wingspan"), vote("u2", "wingspan"), vote("u1", "arcs"), vote("u3", "container")],
    );
    expect(tally).toEqual([
      { slug: "wingspan", votes: 2, voterIds: ["u1", "u2"] },
      { slug: "arcs", votes: 1, voterIds: ["u1"] },
      { slug: "container", votes: 1, voterIds: ["u3"] },
    ]);
  });

  it("keeps zero-vote candidates in the tally", () => {
    const tally = computeTally(["arcs", "wingspan"], [vote("u1", "arcs")]);
    expect(tally).toEqual([
      { slug: "arcs", votes: 1, voterIds: ["u1"] },
      { slug: "wingspan", votes: 0, voterIds: [] },
    ]);
  });

  it("preserves the input (vote-time) order of voter ids per slug", () => {
    const tally = computeTally(
      ["arcs"],
      [vote("u3", "arcs"), vote("u1", "arcs"), vote("u2", "arcs")],
    );
    expect(tally[0]?.voterIds).toEqual(["u3", "u1", "u2"]);
  });

  it("breaks a tie by slug ascending (rankTopSlugs convention)", () => {
    const tally = computeTally(["wingspan", "arcs"], [vote("u1", "wingspan"), vote("u2", "arcs")]);
    expect(tally[0]?.slug).toBe("arcs");
  });
});

describe("computeWinner", () => {
  it("returns the top slug with votes", () => {
    expect(
      computeWinner([
        { slug: "arcs", votes: 3 },
        { slug: "wingspan", votes: 1 },
      ]),
    ).toBe("arcs");
  });

  it("returns null when nobody voted", () => {
    expect(computeWinner([{ slug: "arcs", votes: 0 }])).toBeNull();
    expect(computeWinner([])).toBeNull();
  });
});

describe("distinctVoterCount", () => {
  it("counts distinct users, not votes", () => {
    expect(
      distinctVoterCount([vote("u1", "arcs"), vote("u1", "wingspan"), vote("u2", "arcs")]),
    ).toBe(2);
  });
});
