// Schema-validated SQLite row parsing.
//
// The repo already validates every HTTP / WebSocket payload through Zod
// schemas in `@boardgames/core/protocol`. The SQLite boundary used to
// escape that discipline — every route did `row.foo as string` casts and
// `JSON.parse(row.bar_json as string) as MyType`, so a malformed cell
// would crash deep in the response builder instead of at the boundary.
//
// This module closes that gap. Define a Zod schema per table-shape (or
// per query projection) using ordinary column types plus `jsonColumn(...)`
// for TEXT columns whose value is a JSON-encoded payload. Call
// `parseRow(schema, row, "table_name")` at the read site and downstream
// code receives a fully typed, fully validated record.
//
// Shape errors throw `RowParseError`, carrying both the table name and
// the Zod issue path (e.g. `match_results.outcome_json.winner`) so logs
// pin down the offending column without a debugger.

import type { Row } from "@libsql/client";
import { z } from "zod";

// ── Error ──────────────────────────────────────────────────────────────

/**
 * Thrown when a SQLite row fails schema validation. Mirrors the shape of
 * the web's `SchemaError` (api-fetch.ts) so server logs read uniformly.
 *
 * `source` should name the table or query projection that produced the
 * row (e.g. `"match_results"`, `"match_results.by-night"`). It's the
 * first thing an oncall reads when chasing a deserialization failure.
 */
export class RowParseError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: readonly z.core.$ZodIssue[],
  ) {
    const first = issues[0];
    const path = first?.path.map(String).join(".");
    super(
      `Row parse failed for ${source}${path ? ` at "${path}"` : ""}: ${
        first?.message ?? "unknown error"
      }`,
    );
    this.name = "RowParseError";
  }
}

// ── jsonColumn ─────────────────────────────────────────────────────────

/**
 * Zod helper for TEXT columns whose value is a JSON-encoded payload.
 * Parses the column string as JSON, then pipes the result through `inner`.
 *
 * Issue paths from `inner` are preserved beneath the column key, so a
 * malformed `match_results.outcome_json` surfaces with path
 * `["outcome_json", "winner"]` rather than a generic "invalid JSON".
 *
 * Usage:
 * ```ts
 * const MatchResultRowSchema = z.object({
 *   id: z.number(),
 *   outcome_json: jsonColumn(MatchOutcomeSchema),
 *   ...
 * });
 * ```
 */
export function jsonColumn<S extends z.ZodType>(inner: S): z.ZodType<z.output<S>, string> {
  return z
    .string()
    .transform((raw, ctx): unknown => {
      try {
        return JSON.parse(raw);
      } catch (err) {
        ctx.addIssue({
          code: "custom",
          message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
        return z.NEVER;
      }
    })
    .pipe(inner);
}

// ── parseRow ───────────────────────────────────────────────────────────

/**
 * Validate a single libSQL `Row` against `schema` and return the typed
 * record. Throws `RowParseError` on shape mismatch.
 *
 * `source` should name the table or query projection that produced the
 * row. It appears in the error message so logs identify the offending
 * read without a debugger.
 *
 * The `Row` type from `@libsql/client` is `Record<string, ValueType>`
 * with `ValueType = null | string | number | bigint | ArrayBuffer | boolean`.
 * Schemas use ordinary `z.string()`, `z.number()`, `z.string().nullable()`
 * for plain columns, and `jsonColumn(InnerSchema)` for JSON TEXT columns.
 */
export function parseRow<TOut>(schema: z.ZodType<TOut, unknown>, row: Row, source: string): TOut {
  const result = schema.safeParse(row);
  if (!result.success) {
    throw new RowParseError(source, result.error.issues);
  }
  return result.data;
}

/**
 * Validate an entire result set. Each row is parsed independently; the
 * first failure throws — we don't return a partial array because callers
 * typically render the whole list or none of it.
 *
 * For paths where partial degradation matters, call `parseRow` per row
 * inside an explicit try/catch.
 */
export function parseRows<TOut>(
  schema: z.ZodType<TOut, unknown>,
  rows: readonly Row[],
  source: string,
): TOut[] {
  return rows.map((row) => parseRow(schema, row, source));
}
