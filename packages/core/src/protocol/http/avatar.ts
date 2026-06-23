import { z } from "zod";
import { GameSlugSchema } from "../common.ts";

// AI avatar generation. The user uploads a reference photo, picks a game + a
// style (style === a server-side prompt template), adds optional comments; the
// server fills the template with the game's name/description, sends the photo +
// prompt to an OpenAI image model, and returns a generated avatar for preview.
// The user then confirms to save it (stored as a webp data URI on `user.image`).

// ── Styles ─────────────────────────────────────────────────────────────
// Browse list shared with the UI (the full prompt templates live server-side in
// `server/src/lib/avatar-prompts.ts`). Add new styles in both places.
export const AVATAR_STYLES = [{ id: "standard", label: "Standard" }] as const;
export const AvatarStyleIdSchema = z.enum(["standard"]);
export type AvatarStyleId = z.infer<typeof AvatarStyleIdSchema>;

export const AVATAR_COMMENTS_MAX = 500;

// ── Image data URIs ────────────────────────────────────────────────────
// Reference upload: any common raster format, generously capped (~9 MB base64 ≈
// ~6.5 MB image) — the client should downscale first, and the server resizes it
// again before sending to OpenAI.
const REFERENCE_MAX = 9_000_000;
const ReferenceImageSchema = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Expected an image data URI")
  .max(REFERENCE_MAX, "Reference image is too large");

// Generated/stored avatar: always a small webp the server produced. ~200 KB cap
// is far above a 256px webp (~15 KB) but bounds what can be written to the DB.
const AVATAR_MAX = 200_000;
const WebpDataUriSchema = z
  .string()
  .regex(/^data:image\/webp;base64,/, "Expected a webp data URI")
  .max(AVATAR_MAX);

// ── Generate (preview, not saved) ──────────────────────────────────────
export const GenerateAvatarRequestSchema = z.object({
  referenceImage: ReferenceImageSchema,
  gameSlug: GameSlugSchema,
  styleId: AvatarStyleIdSchema,
  comments: z.string().max(AVATAR_COMMENTS_MAX).nullable(),
});
export type GenerateAvatarRequest = z.infer<typeof GenerateAvatarRequestSchema>;

// Generation runs in the background (it takes ~a minute — far longer than the
// Vercel/Railway proxy will hold a request open), so the POST returns a job id
// and the client polls the status endpoint below.
export const GenerateAvatarResponseSchema = z.object({
  jobId: z.string().min(1),
});
export type GenerateAvatarResponse = z.infer<typeof GenerateAvatarResponseSchema>;

export const AvatarJobStatusSchema = z.object({
  status: z.enum(["pending", "done", "error"]),
  /** A generated 256px webp data URI once `status === "done"`. */
  image: WebpDataUriSchema.nullable(),
  /** A human-readable failure reason once `status === "error"`. */
  error: z.string().nullable(),
});
export type AvatarJobStatus = z.infer<typeof AvatarJobStatusSchema>;

// ── Save (confirm) ─────────────────────────────────────────────────────
export const SaveAvatarRequestSchema = z.object({
  image: WebpDataUriSchema,
});
export type SaveAvatarRequest = z.infer<typeof SaveAvatarRequestSchema>;

export const SaveAvatarResponseSchema = z.object({
  ok: z.literal(true),
  /** The stored data URI (re-encoded server-side). */
  image: z.string(),
});
export type SaveAvatarResponse = z.infer<typeof SaveAvatarResponseSchema>;
