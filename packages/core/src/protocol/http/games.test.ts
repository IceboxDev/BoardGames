import { describe, expect, it } from "vitest";
import {
  BulkSaveResultsBodySchema,
  BulkSaveResultsResponseSchema,
  GameResultListSchema,
  GameResultsQuerySchema,
  MAX_BULK_RESULT_RECORDS,
  ReplayListQuerySchema,
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

describe("GameResultsQuerySchema", () => {
  it("defaults to the handler's historical limit when absent", () => {
    expect(GameResultsQuerySchema.parse({})).toEqual({ limit: 10_000 });
  });

  it("coerces the numeric string a query param actually arrives as", () => {
    expect(GameResultsQuerySchema.parse({ limit: "250" })).toEqual({ limit: 250 });
  });

  // Each of these used to reach `LIMIT ?` verbatim: NaN and 2.5 threw out of
  // libsql (500), "" bound 0 and silently returned nothing, and -1 means
  // UNLIMITED to SQLite. All four are now a 400 at the boundary.
  it.each(["abc", "", "-1", "0", "2.5", "1e9"])("rejects %j", (limit) => {
    expect(() => GameResultsQuerySchema.parse({ limit })).toThrow();
  });
});

describe("ReplayListQuerySchema", () => {
  it("defaults to 50 and accepts a coerced string", () => {
    expect(ReplayListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(ReplayListQuerySchema.parse({ limit: "10" })).toEqual({ limit: 10 });
  });

  it("rejects a limit past the ceiling", () => {
    expect(() => ReplayListQuerySchema.parse({ limit: "201" })).toThrow();
  });
});

describe("BulkSaveResultsBodySchema record cap", () => {
  it("accepts exactly the cap", () => {
    const records = Array.from({ length: MAX_BULK_RESULT_RECORDS }, (_, i) => ({ id: String(i) }));
    expect(() => BulkSaveResultsBodySchema.parse({ records })).not.toThrow();
  });

  // Every record becomes one statement in a single db.batch — an uncapped
  // array is an uncapped transaction against production.
  it("rejects one record past the cap", () => {
    const records = Array.from({ length: MAX_BULK_RESULT_RECORDS + 1 }, (_, i) => ({
      id: String(i),
    }));
    expect(() => BulkSaveResultsBodySchema.parse({ records })).toThrow();
  });
});
