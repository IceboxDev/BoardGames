import OpenAI from "openai";
import sharp from "sharp";

// OpenAI image generation + sharp processing for AI avatars.
//
// This mirrors how ChatGPT's web app does it: a reasoning model (OPENAI_MODEL,
// e.g. gpt-5.5) orchestrates the built-in `image_generation` tool, with the
// reference photo passed as an input image. We let the tool pick its default
// image model (currently gpt-image-2 — the same one the web uses, which
// preserves faces well); a raw `images.edit` call gave noticeably worse
// likeness. Output is normalized to a small square webp data URI — the form
// stored on `user.image`.

/** Thrown when the server isn't configured for image generation (missing key). */
export class AvatarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarConfigError";
  }
}

const AVATAR_SIZE = 256;
const REFERENCE_MAX_EDGE = 1024;

type ImageQuality = "low" | "medium" | "high" | "auto";

function resolveQuality(): ImageQuality {
  const q = (process.env.OPENAI_IMAGE_QUALITY ?? "high").toLowerCase();
  return q === "low" || q === "medium" || q === "auto" ? q : "high";
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AvatarConfigError("Image generation is not configured (OPENAI_API_KEY).");
  return new OpenAI({ apiKey });
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

/**
 * Generate an avatar the way the web does: the chat model orchestrates the
 * `image_generation` tool with the reference photo + prompt. Returns image bytes.
 */
export async function runAvatarGeneration(referencePng: Buffer, prompt: string): Promise<Buffer> {
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
