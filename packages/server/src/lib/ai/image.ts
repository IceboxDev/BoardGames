import { generateText } from "ai";
import { aiSuspended } from "../ai-suspend";
import { gatewayKey, resolveModel } from "./config";
import { AiConfigError, suspendedError } from "./errors";
import { withTransientRetry } from "./retry";

const AVATAR_BUDGET_MS = 3 * 60_000;

function qualityHint(): string {
  const q = (process.env.AI_IMAGE_QUALITY ?? process.env.OPENAI_IMAGE_QUALITY ?? "high")
    .trim()
    .toLowerCase();
  return q === "low" || q === "medium" ? q : "high";
}

/**
 * Gateway avatar generation: a multimodal image model (AI_MODEL_AVATAR)
 * receives the reference photo as an input image part and returns the
 * generated image in `result.files`. Returns raw image bytes; the sharp
 * pipeline in avatar-image.ts turns them into the stored webp data URI.
 */
export async function generateGatewayAvatarImage(
  referencePng: Buffer,
  prompt: string,
): Promise<Buffer> {
  if (aiSuspended()) throw suspendedError();
  if (!gatewayKey()) throw new AiConfigError("AI is not configured (AI_GATEWAY_API_KEY).");
  const model = resolveModel("avatar");
  const result = await withTransientRetry("avatar", () =>
    generateText({
      model,
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
      providerOptions: { gateway: { tags: ["feature:avatar"] } },
    }),
  );
  const image = result.files.find((file) => file.mediaType?.startsWith("image/"));
  if (!image) throw new Error("the image model returned no image");
  return Buffer.from(image.uint8Array);
}
