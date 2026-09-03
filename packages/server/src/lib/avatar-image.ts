import OpenAI, { type ClientOptions } from "openai";
import sharp from "sharp";
import { AiConfigError, generateGatewayAvatarImage, resolveModel } from "./ai";
import { AI_SUSPENDED_MESSAGE, aiSuspended } from "./ai-suspend";

// AI image generation + sharp processing for avatars.
//
// Default path: a multimodal image model through the AI Gateway
// (AI_MODEL_AVATAR, see lib/ai/image.ts) — reference photo in, image out.
// The pre-migration OpenAI path is kept selectable via
// AI_MODEL_AVATAR=openai-image-tool until the gateway model passes the
// likeness acceptance check: it mirrors how ChatGPT's web app does it — a
// reasoning model orchestrates the built-in `image_generation` tool with the
// reference photo as input image; a raw `images.edit` call gave noticeably
// worse likeness, so don't downgrade this to a plain image call. Output is
// normalized to a small square webp data URI — the form stored on
// `user.image`.

/** Thrown when the server isn't configured for image generation (missing key). */
export class AvatarConfigError extends AiConfigError {
  constructor(message: string) {
    super(message);
    this.name = "AvatarConfigError";
  }
}

/** Sentinel AI_MODEL_AVATAR value selecting the legacy direct-OpenAI path. */
const OPENAI_IMAGE_TOOL = "openai-image-tool";

const AVATAR_SIZE = 256;
const REFERENCE_MAX_EDGE = 1024;

type ImageQuality = "low" | "medium" | "high" | "auto";

function resolveQuality(): ImageQuality {
  const q = (process.env.OPENAI_IMAGE_QUALITY ?? "high").toLowerCase();
  return q === "low" || q === "medium" || q === "auto" ? q : "high";
}

function getClient(): OpenAI {
  if (aiSuspended()) throw new AvatarConfigError(AI_SUSPENDED_MESSAGE);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AvatarConfigError("Image generation is not configured (OPENAI_API_KEY).");
  // node-fetch (the SDK's default) premature-closes on Railway; use undici.
  return new OpenAI({ apiKey, fetch: globalThis.fetch as unknown as ClientOptions["fetch"] });
}

export function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  if (comma === -1) throw new Error("malformed data URI");
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

/** Downscale a reference photo to ≤1024px PNG (cheaper + within model limits). */
export async function prepareReference(dataUri: string): Promise<Buffer> {
  return sharp(dataUriToBuffer(dataUri))
    .rotate() // honor EXIF orientation before stripping metadata
    .resize(REFERENCE_MAX_EDGE, REFERENCE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

/** Any image buffer → a 256px square webp data URI (the stored avatar form). */
export async function toAvatarDataUri(input: Buffer): Promise<string> {
  const webp = await sharp(input)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

/** Generate the avatar image bytes on whichever path AI_MODEL_AVATAR selects. */
export async function runAvatarGeneration(referencePng: Buffer, prompt: string): Promise<Buffer> {
  if (resolveModel("avatar") === OPENAI_IMAGE_TOOL) {
    return runOpenAiAvatarGeneration(referencePng, prompt);
  }
  return generateGatewayAvatarImage(referencePng, prompt);
}

/**
 * Legacy path: the chat model orchestrates OpenAI's `image_generation` tool
 * with the reference photo + prompt. Returns image bytes. Bills OpenAI
 * directly (OPENAI_API_KEY), not gateway credits.
 */
async function runOpenAiAvatarGeneration(referencePng: Buffer, prompt: string): Promise<Buffer> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
  const referenceDataUri = `data:image/png;base64,${referencePng.toString("base64")}`;

  const imageTool = {
    type: "image_generation" as const,
    quality: resolveQuality(),
    size: "1024x1024" as const,
  };

  const res = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", detail: "high", image_url: referenceDataUri },
        ],
      },
    ],
    tools: [imageTool],
  });

  const call = res.output.find((item) => item.type === "image_generation_call");
  if (!call?.result) throw new Error("the image model returned no image");
  return Buffer.from(call.result, "base64");
}
