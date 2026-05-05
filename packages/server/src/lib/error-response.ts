import { ErrorResponseSchema } from "@boardgames/core/protocol/common";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

/**
 * Return a typed error response that conforms to the protocol-shared
 * `ErrorResponseSchema`. The schema's `.parse()` runs in dev as a self-check
 * — drift here is loud, not silent.
 */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  error: string,
  code?: string,
) {
  const envelope = ErrorResponseSchema.parse({ error, ...(code ? { code } : {}) });
  return c.json(envelope, status);
}

/**
 * Hono middleware: validate JSON request body against `schema`. On
 * mismatch, respond with our shared error envelope (so the client's
 * `apiFetch` can surface it as `ApiError`).
 */
export function zJsonBody<T extends z.ZodTypeAny>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".") || "(root)";
      return errorResponse(
        c,
        400,
        `${path}: ${issue?.message ?? "invalid request"}`,
        "BAD_REQUEST",
      );
    }
  });
}

/**
 * Hono middleware: validate query string against `schema`. Same error
 * envelope as `zJsonBody`.
 */
export function zQuery<T extends z.ZodTypeAny>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".") || "(root)";
      return errorResponse(c, 400, `${path}: ${issue?.message ?? "invalid query"}`, "BAD_REQUEST");
    }
  });
}
