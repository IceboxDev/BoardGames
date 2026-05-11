import { BggGameSchema, type BggSnapshot, BggSnapshotSchema } from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse } from "../lib/error-response.ts";

export const bggRoutes = authedApp();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

bggRoutes.get("/", async (c) => {
  const { rows } = await getDb().execute("SELECT slug, metadata_json FROM bgg_cache ORDER BY slug");
  const snapshot: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      snapshot[row.slug as string] = JSON.parse(row.metadata_json as string);
    } catch {
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(rows[0].metadata_json as string);
  } catch {
    return errorResponse(c, 500, "cached entry is malformed", "BAD_CACHE");
  }
  return c.json(BggGameSchema.parse(parsed));
});
