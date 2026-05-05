import { OkResponseSchema, SetOnlineBodySchema } from "@boardgames/core/protocol";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const adminOnlineRoutes = adminApp();

adminOnlineRoutes.post("/:id/online", zJsonBody(SetOnlineBodySchema), async (c) => {
  const userId = c.req.param("id");
  const { onlineEnabled } = c.req.valid("json");

  const result = await getDb().execute({
    sql: "UPDATE user SET onlineEnabled = ? WHERE id = ?",
    args: [onlineEnabled ? 1 : 0, userId],
  });

  if (result.rowsAffected === 0) {
    return errorResponse(c, 404, "user not found");
  }
  return c.json(OkResponseSchema.parse({ ok: true }));
});
