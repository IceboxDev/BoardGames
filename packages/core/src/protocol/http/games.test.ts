import { describe, expect, it } from "vitest";
import {
  BulkSaveResultsBodySchema,
  BulkSaveResultsResponseSchema,
  GameResultListSchema,
  ReplaySummaryListSchema,
  SaveResultResponseSchema,
} from "./games.ts";

describe("GameResultListSchema", () => {
  it("accepts results with arbitrary keys but requires createdAt", () => {
    expect(() =>
      GameResultListSchema.parse([
        { createdAt: "2026-05-05", winner: "a", score: 42 },
        { createdAt: "2026-05-06", id: "abc", payload: {} },
      ]),
    ).not.toThrow();
  });

  it("rejects entries missing createdAt", () => {
    expect(() => GameResultListSchema.parse([{ winner: "a" }])).toThrow();
  });
});

describe("SaveResultResponseSchema", () => {
  it("accepts ok: true with optional existed", () => {
    expect(() => SaveResultResponseSchema.parse({ ok: true })).not.toThrow();
    expect(() => SaveResultResponseSchema.parse({ ok: true, existed: true })).not.toThrow();
  });
});

describe("BulkSaveResults", () => {
  it("body requires a records array", () => {
    expect(() => BulkSaveResultsBodySchema.parse({ records: [] })).not.toThrow();
    expect(() => BulkSaveResultsBodySchema.parse({})).toThrow();
  });

  it("response requires inserted/skipped counts", () => {
    expect(() =>
      BulkSaveResultsResponseSchema.parse({ ok: true, inserted: 5, skipped: 0 }),
    ).not.toThrow();
    expect(() => BulkSaveResultsResponseSchema.parse({ ok: true, inserted: 5 })).toThrow();
  });
});

describe("ReplaySummaryListSchema", () => {
  it("accepts a list of replay summaries", () => {
    expect(() =>
      ReplaySummaryListSchema.parse([
        {
          id: 1,
          aiEngine: "mcts",
          scoreP0: 12,
          scoreP1: 8,
          winner: "p0",
          createdAt: "2026-05-05",
        },
      ]),
    ).not.toThrow();
  });

  it("accepts nulls in optional score fields", () => {
    expect(() =>
      ReplaySummaryListSchema.parse([
        {
          id: 2,
          aiEngine: null,
          scoreP0: null,
          scoreP1: null,
          winner: null,
          createdAt: "2026-05-05",
        },
      ]),
    ).not.toThrow();
  });
});
