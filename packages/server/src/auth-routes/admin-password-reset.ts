import { AdminResetLinkResponseSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { auth } from "../auth/config.ts";
import { adminApp } from "../auth/index.ts";
import { resetPasswordWebUrl, withResetCapture } from "../auth/reset-link.ts";
import { getDb } from "../db.ts";
import { parseRow } from "../lib/db-rows.ts";
import { errorResponse } from "../lib/error-response.ts";

export const adminPasswordResetRoutes = adminApp();

// Keep in sync with `resetPasswordTokenExpiresIn` (auth/config.ts, seconds).
const RESET_EXPIRES_MINUTES = 60;

const UserEmailRowSchema = z.object({ email: z.string() });

/**
 * Mint a one-time password-reset link for a user (no email is sent). We trigger
 * better-auth's own reset flow server-side; its `sendResetPassword` callback
 * pushes the freshly-minted token into the in-memory sink, which
 * `withResetCapture` reads back. The admin copies the returned URL and relays it
 * out of band. `redirectTo` is intentionally omitted — we build our own web URL
 * from the token, so better-auth's origin check never applies.
 */
adminPasswordResetRoutes.post("/:id/reset-link", async (c) => {
  const id = c.req.param("id");

  const { rows } = await getDb().execute({
    sql: "SELECT email FROM user WHERE id = ? LIMIT 1",
    args: [id],
  });
  if (rows.length === 0) return errorResponse(c, 404, "User not found");
  const { email } = parseRow(UserEmailRowSchema, rows[0], "user.email");

  const { token } = await withResetCapture(() =>
    auth.api.requestPasswordReset({ body: { email }, headers: c.req.raw.headers }),
  );
  if (!token) {
    return errorResponse(c, 422, "Couldn't generate a reset link for this account.");
  }

  return c.json(
    AdminResetLinkResponseSchema.parse({
      url: resetPasswordWebUrl(token),
      expiresInMinutes: RESET_EXPIRES_MINUTES,
    }),
  );
});
