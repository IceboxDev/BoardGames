import { describe, expect, it } from "vitest";
import {
  StartTournamentBodySchema,
  StrategyListSchema,
  TournamentStreamEventSchema,
  TournamentSummarySchema,
} from "./tournament.ts";

describe("StrategyListSchema", () => {
  it("accepts a list of {id,label} objects", () => {
    expect(() =>
      StrategyListSchema.parse([
        { id: "ismcts-v6", label: "Adaptive+" },
        { id: "ismcts-v1", label: "Baseline" },
      ]),
    ).not.toThrow();
  });

  it("rejects entries missing label", () => {
    expect(() => StrategyListSchema.parse([{ id: "x" }])).toThrow();
  });
});

describe("StartTournamentBodySchema", () => {
  it("requires gameSlug and config", () => {
    expect(() =>
      StartTournamentBodySchema.parse({ gameSlug: "lost-cities", config: { numGames: 100 } }),
    ).not.toThrow();
    expect(() => StartTournamentBodySchema.parse({ gameSlug: "lost-cities" })).toThrow();
  });

  it("rejects bad slug shape", () => {
    expect(() =>
      StartTournamentBodySchema.parse({ gameSlug: "Lost Cities", config: {} }),
    ).toThrow();
  });
});

describe("TournamentSummarySchema", () => {
  it("accepts a fully-populated summary", () => {
    expect(() =>
      TournamentSummarySchema.parse({
        id: "t-1",
        game_slug: "lost-cities",
        config: { numGames: 100 },
        status: "completed",
        result: { winner: "a" },
        progress_completed: 100,
        progress_total: 100,
        created_at: "2026-05-05 12:00:00",
        completed_at: "2026-05-05 12:30:00",
      }),
    ).not.toThrow();
  });

  it("accepts null result and completed_at", () => {
    expect(() =>
      TournamentSummarySchema.parse({
        id: "t-2",
        game_slug: "lost-cities",
        config: {},
        status: "running",
        result: null,
        progress_completed: 5,
        progress_total: 100,
        created_at: "2026-05-05",
        completed_at: null,
      }),
    ).not.toThrow();
  });
});

describe("TournamentStreamEventSchema", () => {
  it("accepts a progress event", () => {
    expect(() =>
      TournamentStreamEventSchema.parse({
        kind: "progress",
        version: 1,
        completed: 12,
        total: 100,
      }),
    ).not.toThrow();
  });

  it("supplies version=1 by default", () => {
    const parsed = TournamentStreamEventSchema.parse({
      kind: "progress",
      completed: 0,
      total: 1,
    });
    expect(parsed.version).toBe(1);
  });

  it("accepts a complete event", () => {
    expect(() =>
      TournamentStreamEventSchema.parse({
        kind: "complete",
        version: 1,
        result: { winner: "a" },
      }),
    ).not.toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      TournamentStreamEventSchema.parse({ kind: "unknown", completed: 0, total: 1 }),
    ).toThrow();
  });
});
