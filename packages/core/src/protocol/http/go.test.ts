import { describe, expect, it } from "vitest";
import { CreateGoReviewRequestSchema, GO_SGF_MAX_BYTES, GoReviewSchema } from "./go.ts";

describe("Go review schemas", () => {
  it("parses a finished review", () => {
    const review = GoReviewSchema.parse({
      id: 3,
      status: "done",
      progress: 1,
      analysis: {
        visits: 100,
        start: { winrate: 0.55, scoreLead: 0.4 },
        moves: [
          { move: 1, winrate: 0.5, scoreLead: 0.1, best: "D4", pv: ["D4", "Q16"], loss: 0.3 },
        ],
      },
      sgf: null,
      error: null,
    });
    expect(review.analysis?.moves[0]?.best).toBe("D4");
  });

  it("rejects a negative loss and an unknown status", () => {
    const base = { id: 1, progress: 0, analysis: null, sgf: null, error: null };
    expect(() => GoReviewSchema.parse({ ...base, status: "paused" })).toThrow(/status/);
    expect(() =>
      GoReviewSchema.parse({
        ...base,
        status: "done",
        analysis: {
          visits: 1,
          start: { winrate: 0.5, scoreLead: 0 },
          moves: [{ move: 1, winrate: 0.5, scoreLead: 0, best: null, pv: [], loss: -1 }],
        },
      }),
    ).toThrow(/loss/);
  });

  it("caps the size of an imported SGF", () => {
    expect(() =>
      CreateGoReviewRequestSchema.parse({ sgf: "x".repeat(GO_SGF_MAX_BYTES + 1) }),
    ).toThrow(/sgf/);
    expect(() => CreateGoReviewRequestSchema.parse({ sgf: "" })).toThrow(/sgf/);
  });
});
