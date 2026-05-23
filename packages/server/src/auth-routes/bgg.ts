import { BggGameSchema, type BggSnapshot, BggSnapshotSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, RowParseError } from "../lib/db-rows.ts";
import { errorResponse } from "../lib/error-response.ts";

export const bggRoutes = authedApp();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** `SELECT slug, metadata_json FROM bgg_cache` row projection. */
const BggCacheRowSchema = z.object({
  slug: z.string(),
  metadata_json: jsonColumn(BggGameSchema),
});

/** `SELECT metadata_json FROM bgg_cache WHERE slug = ?` row projection. */
const BggMetadataOnlyRowSchema = z.object({
  metadata_json: jsonColumn(BggGameSchema),
});

bggRoutes.get("/", async (c) => {
  const { rows } = await getDb().execute("SELECT slug, metadata_json FROM bgg_cache ORDER BY slug");
  const snapshot: Record<string, unknown> = {};
  for (const row of rows) {
    // Per-row try/catch keeps the list endpoint lenient — a single
    // malformed cache entry shouldn't 500 the whole snapshot.
    try {
      const parsed = parseRow(BggCacheRowSchema, row, "bgg_cache");
      snapshot[parsed.slug] = parsed.metadata_json;
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
      // Drop malformed rows rather than 500 the whole list.
    }
  }
  const validated: BggSnapshot = BggSnapshotSchema.parse(snapshot);
  return c.json(validated);
});

bggRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!SLUG_RE.test(slug)) {
    return errorResponse(c, 400, "invalid slug", "BAD_REQUEST");
  }
  const { rows } = await getDb().execute({
    sql: "SELECT metadata_json FROM bgg_cache WHERE slug = ? LIMIT 1",
    args: [slug],
  });
  if (rows.length === 0) {
    return errorResponse(c, 404, "no BGG cache entry for that slug", "NOT_FOUND");
  }
  try {
    const { metadata_json } = parseRow(BggMetadataOnlyRowSchema, rows[0], "bgg_cache");
    return c.json(metadata_json);
  } catch (err) {
    if (err instanceof RowParseError) {
      return errorResponse(c, 500, "cached entry is malformed", "BAD_CACHE");
    }
    throw err;
  }
});
