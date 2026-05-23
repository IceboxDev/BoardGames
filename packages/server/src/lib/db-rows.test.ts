import type { Row } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonColumn, parseRow, parseRows, RowParseError } from "./db-rows.ts";

// libSQL's `Row` type is `Record<string, Value>` with extra numeric
// indexing. The tests use plain object literals — Zod ignores extra
// indices, and `parseRow` accepts any `Record<string, unknown>` shape
// once cast to `Row`. A small helper keeps the assertions tidy without
// triggering biome's `noExplicitAny`.
function makeRow(record: Record<string, unknown>): Row {
  return record as unknown as Row;
}

// ── A representative row schema used across happy-path tests ─────────

const InnerOutcomeSchema = z.object({
  winner: z.enum(["p0", "p1", "draw"]),
  scores: z.tuple([z.number(), z.number()]),
});

const RowSchema = z.object({
  id: z.number(),
  game_slug: z.string(),
  notes: z.string().nullable(),
  outcome_json: jsonColumn(InnerOutcomeSchema),
});

describe("parseRow", () => {
  it("returns a typed record on valid input", () => {
    const row = makeRow({
      id: 42,
      game_slug: "lost-cities",
      notes: null,
      outcome_json: JSON.stringify({ winner: "p0", scores: [120, 80] }),
    });

    const parsed = parseRow(RowSchema, row, "match_results");

    expect(parsed.id).toBe(42);
    expect(parsed.game_slug).toBe("lost-cities");
    expect(parsed.notes).toBeNull();
    // `outcome_json` is decoded from string → object via the pipe.
    expect(parsed.outcome_json).toEqual({ winner: "p0", scores: [120, 80] });
  });

  it("throws RowParseError when a scalar column has the wrong type", () => {
    const row = makeRow({
      id: "not-a-number",
      game_slug: "lost-cities",
      notes: null,
      outcome_json: JSON.stringify({ winner: "p0", scores: [0, 0] }),
    });

    expect(() => parseRow(RowSchema, row, "match_results")).toThrow(RowParseError);

    try {
      parseRow(RowSchema, row, "match_results");
    } catch (err) {
      expect(err).toBeInstanceOf(RowParseError);
      const parseError = err as RowParseError;
      expect(parseError.source).toBe("match_results");
      expect(parseError.issues[0]?.path).toEqual(["id"]);
      expect(parseError.message).toContain("match_results");
      expect(parseError.message).toContain("id");
    }
  });

  it("throws RowParseError when a required column is missing", () => {
    const row = makeRow({
      id: 1,
      game_slug: "lost-cities",
      // notes intentionally missing
      outcome_json: JSON.stringify({ winner: "p0", scores: [0, 0] }),
    });

    try {
      parseRow(RowSchema, row, "match_results");
      expect.fail("expected RowParseError");
    } catch (err) {
      expect(err).toBeInstanceOf(RowParseError);
      const parseError = err as RowParseError;
      expect(parseError.issues[0]?.path).toEqual(["notes"]);
    }
  });

  it("accepts null for nullable columns", () => {
    const row = makeRow({
      id: 1,
      game_slug: "lost-cities",
      notes: null,
      outcome_json: JSON.stringify({ winner: "draw", scores: [50, 50] }),
    });

    const parsed = parseRow(RowSchema, row, "match_results");
    expect(parsed.notes).toBeNull();
  });
});

describe("jsonColumn", () => {
  it("preserves inner schema's issue path beneath the column key", () => {
    // Valid JSON, but the inner shape rejects an unknown winner.
    const row = makeRow({
      id: 1,
      game_slug: "lost-cities",
      notes: null,
      outcome_json: JSON.stringify({ winner: "p2", scores: [1, 2] }),
    });

    try {
      parseRow(RowSchema, row, "match_results");
      expect.fail("expected RowParseError");
    } catch (err) {
      expect(err).toBeInstanceOf(RowParseError);
      const parseError = err as RowParseError;
      // Path is column → inner field, not a generic "invalid JSON".
      expect(parseError.issues[0]?.path).toEqual(["outcome_json", "winner"]);
    }
  });

  it("surfaces malformed JSON as a typed issue on the column", () => {
    const row = makeRow({
      id: 1,
      game_slug: "lost-cities",
      notes: null,
      outcome_json: "not-json{",
    });

    try {
      parseRow(RowSchema, row, "match_results");
      expect.fail("expected RowParseError");
    } catch (err) {
      expect(err).toBeInstanceOf(RowParseError);
      const parseError = err as RowParseError;
      expect(parseError.issues[0]?.path).toEqual(["outcome_json"]);
      expect(parseError.issues[0]?.message).toContain("invalid JSON");
    }
  });

  it("rejects a non-string value at the column (defensive)", () => {
    // libSQL TEXT columns always come back as strings, but a misnamed
    // column or wrong query projection could surface a number — we
    // shouldn't let it through.
    const row = makeRow({
      id: 1,
      game_slug: "lost-cities",
      notes: null,
      outcome_json: 12345,
    });

    expect(() => parseRow(RowSchema, row, "match_results")).toThrow(RowParseError);
  });
});

describe("parseRows", () => {
  it("returns an array of typed records", () => {
    const rows = [
      makeRow({
        id: 1,
        game_slug: "lost-cities",
        notes: null,
        outcome_json: JSON.stringify({ winner: "p0", scores: [1, 2] }),
      }),
      makeRow({
        id: 2,
        game_slug: "pandemic",
        notes: "great game",
        outcome_json: JSON.stringify({ winner: "p1", scores: [3, 4] }),
      }),
    ];

    const parsed = parseRows(RowSchema, rows, "match_results");
    expect(parsed).toHaveLength(2);
    expect(parsed[0].game_slug).toBe("lost-cities");
    expect(parsed[1].notes).toBe("great game");
  });

  it("throws on the first invalid row (no partial returns)", () => {
    const rows = [
      makeRow({
        id: 1,
        game_slug: "lost-cities",
        notes: null,
        outcome_json: JSON.stringify({ winner: "p0", scores: [1, 2] }),
      }),
      makeRow({
        id: "boom",
        game_slug: "pandemic",
        notes: null,
        outcome_json: JSON.stringify({ winner: "p1", scores: [3, 4] }),
      }),
    ];

    expect(() => parseRows(RowSchema, rows, "match_results")).toThrow(RowParseError);
  });
});
