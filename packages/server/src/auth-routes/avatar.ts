// AI avatar generation routes (self or admin). Mounted under `/api/profiles`
// alongside the profile routes (behind requireAuth + requireOffline).
//
// Generation takes ~a minute — longer than the prod proxy (Vercel rewrite →
// Railway) holds a request open, which 502s a long request. So `generate`
// starts a background job and returns its id immediately; the client polls the
// status route. `save` persists a confirmed avatar as a webp data URI.

import { getBggBySlug } from "@boardgames/core/bgg";
import {
  AvatarJobStatusSchema,
  GenerateAvatarRequestSchema,
  GenerateAvatarResponseSchema,
  SaveAvatarRequestSchema,
  SaveAvatarResponseSchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import {
  AvatarConfigError,
  dataUriToBuffer,
  prepareReference,
  runAvatarGeneration,
  toAvatarDataUri,
} from "../lib/avatar-image.ts";
import {
  completeAvatarJob,
  createAvatarJob,
  failAvatarJob,
  getAvatarJob,
} from "../lib/avatar-jobs.ts";
import { buildAvatarPrompt } from "../lib/avatar-prompts.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const avatarRoutes = authedApp();

avatarRoutes.post("/:userId/avatar/generate", zJsonBody(GenerateAvatarRequestSchema), async (c) => {
  const userId = c.req.param("userId");
  const user = c.get("user");
  // Self, or an admin generating for any user.
  if (user.id !== userId && user.role !== "admin") {
    return errorResponse(c, 403, "cannot generate an avatar for another user", "FORBIDDEN");
  }
  const body = c.req.valid("json");

  const bgg = getBggBySlug(body.gameSlug);
  if (!bgg) {
    return errorResponse(c, 400, "unknown game", "UNKNOWN_GAME");
  }

  const prompt = buildAvatarPrompt(body.styleId, bgg.name, bgg.description ?? "", body.comments);
  const jobId = createAvatarJob(userId);

  // Run in the background — the request returns now; the work outlives it on the
  // persistent Node server. `void` + an internal try/catch keeps it from ever
  // becoming an unhandled rejection.
  void (async () => {
    try {
      const reference = await prepareReference(body.referenceImage);
      const generated = await runAvatarGeneration(reference, prompt);
      completeAvatarJob(jobId, await toAvatarDataUri(generated));
    } catch (err) {
      const message =
        err instanceof AvatarConfigError
          ? err.message
          : `Image generation failed: ${err instanceof Error ? err.message : "unknown error"}`;
      failAvatarJob(jobId, message);
    }
  })();

  return c.json(GenerateAvatarResponseSchema.parse({ jobId }));
});

avatarRoutes.get("/:userId/avatar/generate/:jobId", async (c) => {
  const userId = c.req.param("userId");
  const user = c.get("user");
  if (user.id !== userId && user.role !== "admin") {
    return errorResponse(c, 403, "cannot view another user's avatar job", "FORBIDDEN");
  }
  const job = getAvatarJob(c.req.param("jobId"));
  if (!job || job.userId !== userId) {
    return errorResponse(c, 404, "avatar job not found", "NOT_FOUND");
  }
  return c.json(
    AvatarJobStatusSchema.parse({ status: job.status, image: job.image, error: job.error }),
  );
});

avatarRoutes.put("/:userId/avatar", zJsonBody(SaveAvatarRequestSchema), async (c) => {
  const userId = c.req.param("userId");
  const user = c.get("user");
  // Self, or an admin changing any user's avatar.
  if (user.id !== userId && user.role !== "admin") {
    return errorResponse(c, 403, "cannot change another user's avatar", "FORBIDDEN");
  }
  const { image } = c.req.valid("json");

  // Re-encode whatever the client sends through sharp so the stored value is a
  // bounded 256px webp regardless of the posted payload.
  const clean = await toAvatarDataUri(dataUriToBuffer(image));
  await getDb().execute({
    sql: "UPDATE user SET image = ? WHERE id = ?",
    args: [clean, userId],
  });

  return c.json(SaveAvatarResponseSchema.parse({ ok: true, image: clean }));
});
