import {
  AvailabilityMapSchema,
  OkResponseSchema,
  PushAvailabilityBodySchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const userAvailabilityRoutes = authedApp();

userAvailabilityRoutes.get("/availability", async (c) => {
  const user = c.get("user");
  const { rows } = await getDb().execute({
    sql: "SELECT availability_json FROM user_availability WHERE user_id = ?",
    args: [user.id],
  });
  if (rows.length === 0) return c.json(AvailabilityMapSchema.parse({}));
  const raw = JSON.parse(rows[0].availability_json as string);
  return c.json(AvailabilityMapSchema.parse(raw));
});

userAvailabilityRoutes.put("/availability", zJsonBody(PushAvailabilityBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  if (Object.keys(body).length > 200) {
    return errorResponse(c, 400, "too many entries", "TOO_MANY_ENTRIES");
  }

  await getDb().execute({
    sql: `INSERT INTO user_availability (user_id, availability_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            availability_json = excluded.availability_json,
            updated_at = excluded.updated_at`,
    args: [user.id, JSON.stringify(body)],
  });

  return c.json(OkResponseSchema.parse({ ok: true }));
});
