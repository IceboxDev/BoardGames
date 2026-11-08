import { generateText } from "ai";
import { aiSuspended } from "../ai-suspend";
import { resolveModel } from "./config";
import { suspendedError } from "./errors";
import { languageModel, requireKey } from "./models";
import { adapterFor } from "./providers";
import { withTransientRetry } from "./retry";

const AVATAR_BUDGET_MS = 3 * 60_000;

function qualityHint(): string {
  const q = (process.env.AI_IMAGE_QUALITY ?? process.env.OPENAI_IMAGE_QUALITY ?? "high")
    .trim()
    .toLowerCase();
  return q === "low" || q === "medium" ? q : "high";
}

/**
 * Avatar generation: a multimodal image model (the profile's `image` role,
 * or AI_MODEL_AVATAR; a profile without one throws AiConfigError → 503)
 * receives the reference photo as an input image part and returns the
 * generated image in `result.files`. Returns raw image bytes; the sharp
 * pipeline in avatar-image.ts turns them into the stored webp data URI.
 */
export async function generateAvatarImage(referencePng: Buffer, prompt: string): Promise<Buffer> {
  if (aiSuspended()) throw suspendedError();
  const ref = resolveModel("avatar");
  requireKey(ref);
  const providerOptions = adapterFor(ref).providerOptions({ feature: "avatar" });
  const result = await withTransientRetry("avatar", () =>
    generateText({
      model: languageModel(ref),
      messages: [
        {
          role: "user",
          content: [
            { type: "file", data: referencePng, mediaType: "image/png" },
            { type: "text", text: `${prompt}\n\nRender at ${qualityHint()} quality, 1024x1024.` },
          ],
        },
      ],
      maxRetries: 0,
      timeout: { totalMs: AVATAR_BUDGET_MS },
      ...(providerOptions ? { providerOptions } : {}),
    }),
  );
  const image = result.files.find((file) => file.mediaType?.startsWith("image/"));
  if (!image) throw new Error("the image model returned no image");
  return Buffer.from(image.uint8Array);
}
