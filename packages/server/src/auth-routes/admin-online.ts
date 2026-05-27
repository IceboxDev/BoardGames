import { OkResponseSchema, SetOnlineModeBodySchema } from "@boardgames/core/protocol";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const adminOnlineRoutes = adminApp();

// POST /:id/online-mode — admin sets one of {'online','offline','both'} for a
// user. The column is NOT NULL DEFAULT 'offline' since migration 0003, so the
// UPDATE here always sets a real enum value; the route does no defaulting.
adminOnlineRoutes.post("/:id/online-mode", zJsonBody(SetOnlineModeBodySchema), async (c) => {
  const userId = c.req.param("id");
  const { onlineMode } = c.req.valid("json");

  const result = await getDb().execute({
    sql: `UPDATE "user" SET "onlineMode" = ? WHERE id = ?`,
    args: [onlineMode, userId],
  });

  if (result.rowsAffected === 0) {
    return errorResponse(c, 404, "user not found");
  }
  return c.json(OkResponseSchema.parse({ ok: true }));
});
