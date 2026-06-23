// AI avatar generation routes (self-only). Generate previews an avatar from a
// reference photo + game + style without saving; save persists a confirmed one
// as a webp data URI on `user.image`. Mounted under `/api/profiles` alongside
// the profile routes (both behind requireAuth).

import { getBggBySlug } from "@boardgames/core/bgg";
import {
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

  try {
    const reference = await prepareReference(body.referenceImage);
    const generated = await runAvatarGeneration(reference, prompt);
    const image = await toAvatarDataUri(generated);
    return c.json(GenerateAvatarResponseSchema.parse({ image }));
  } catch (err) {
    if (err instanceof AvatarConfigError) {
      return errorResponse(c, 503, err.message, "AVATAR_NOT_CONFIGURED");
    }
    const message = err instanceof Error ? err.message : "image generation failed";
    return errorResponse(c, 502, `Image generation failed: ${message}`, "GENERATION_FAILED");
  }
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
