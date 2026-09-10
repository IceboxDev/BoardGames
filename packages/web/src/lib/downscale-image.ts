// Downscale a user-picked image file to a data URI before uploading it. Keeps
// the request small (phone photos can be 5–12 MB) and bakes in EXIF
// orientation so sideways shots upload upright. The server re-encodes every
// upload again, so this is a transport concern, not the final quality.
//
// One canvas path serves every caller: the avatar-generation reference, the
// finished-avatar upload, and the arrivals photo. They differ only in the
// options they pass and the size ladder they walk.

export type DownscaleMime = "image/jpeg" | "image/webp" | "image/png";

export type DownscaleOptions = {
  /** Longest edge after scaling; never upscales. */
  maxEdge?: number;
  /** Encoder quality 0..1 (ignored for png). */
  quality?: number;
  mimeType?: DownscaleMime;
};

export type DownscaledImage = {
  dataUri: string;
  width: number;
  height: number;
  /** Decoded size of the base64 payload — what the server will receive. */
  bytes: number;
};

/** Scale (w, h) to fit inside `maxEdge` on the longer side, never enlarging. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Bytes a base64 data URI decodes to (the payload after the comma). */
export function dataUriBytes(uri: string): number {
  const comma = uri.indexOf(",");
  const payload = comma === -1 ? "" : uri.slice(comma + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

/**
 * Decode the file upright. `createImageBitmap` applies EXIF orientation for
 * us; where it is missing (jsdom, very old WebKit) an `<img>` is used — modern
 * engines apply orientation to `<img>` by default, so the result is upright
 * everywhere that matters.
 */
async function decodeFile(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

export async function downscaleImageFile(
  file: File,
  { maxEdge = 1024, quality = 0.9, mimeType = "image/webp" }: DownscaleOptions = {},
): Promise<DownscaledImage> {
  const decoded = await decodeFile(file);
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const dataUri = canvas.toDataURL(mimeType, quality);
    return { dataUri, width, height, bytes: dataUriBytes(dataUri) };
  } finally {
    decoded.close();
  }
}

/**
 * The avatar-generation reference: webp where supported (browsers without a
 * webp encoder silently produce png, which the reference schema also accepts).
 */
export async function fileToDownscaledDataUri(
  file: File,
  maxEdge = 1024,
  quality = 0.9,
): Promise<string> {
  return (await downscaleImageFile(file, { maxEdge, quality, mimeType: "image/webp" })).dataUri;
}

// ── Finished-avatar upload ───────────────────────────────────────────────
//
// A picture made ANYWHERE (ChatGPT, an illustrator, a plain photo) takes this
// path instead of the AI generator. The save route's schema is strict — it
// accepts `data:image/webp;base64,` only, under 200_000 chars — so the
// conversion has to happen before the request, not on the server.
//
// 512px, not 256: the server re-crops to a 256 square with `fit: cover`, so
// sending it a slightly larger canvas leaves pixels to crop from instead of
// forcing an upscale on a non-square source.
const AVATAR_UPLOAD_MAX_EDGE = 512;
/** Server cap is 200_000; stop well short so base64 growth can't cross it. */
const AVATAR_UPLOAD_MAX_CHARS = 180_000;
const AVATAR_QUALITY_LADDER = [0.82, 0.7, 0.55] as const;

/**
 * A user-supplied image file → the webp data URI `saveAvatar` accepts.
 * Steps quality down until it fits the size cap; throws a message meant for
 * the user if the browser can't produce webp at all (canvas silently falls
 * back to PNG, which the save schema rejects) or the image stays too large.
 */
export async function fileToAvatarDataUri(file: File): Promise<string> {
  for (const quality of AVATAR_QUALITY_LADDER) {
    const uri = await fileToDownscaledDataUri(file, AVATAR_UPLOAD_MAX_EDGE, quality);
    if (!uri.startsWith("data:image/webp;base64,")) {
      throw new Error("This browser can't produce webp images — try Chrome, Edge, or Safari 14+.");
    }
    if (uri.length <= AVATAR_UPLOAD_MAX_CHARS) return uri;
  }
  throw new Error("That image is too detailed to compress — try a simpler or smaller picture.");
}

// ── Arrivals photo upload ────────────────────────────────────────────────
//
// A real-world photo of a game box, on its way to the admin composer's
// preview and then the publish request. JPEG on purpose: `toDataURL` for
// webp silently falls back to PNG on engines without a webp encoder, and a
// 2000px PNG photo is 6–12 MB — past the cap. JPEG encodes everywhere and the
// server re-encodes to webp anyway.
export const ARRIVAL_PHOTO_MAX_EDGE = 2000;
const ARRIVAL_PHOTO_FALLBACK_EDGE = 1600;
/** Server cap is 8_000_000 chars; stop well short so nothing rides the edge. */
export const ARRIVAL_PHOTO_TARGET_CHARS = 6_000_000;
const ARRIVAL_QUALITY_LADDER = [0.9, 0.8, 0.7] as const;
const ARRIVAL_ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function fileToArrivalPhoto(file: File): Promise<DownscaledImage> {
  if (!ARRIVAL_ACCEPTED.has(file.type)) {
    throw new Error("Choose a PNG, JPEG or WebP photo.");
  }
  for (const maxEdge of [ARRIVAL_PHOTO_MAX_EDGE, ARRIVAL_PHOTO_FALLBACK_EDGE]) {
    for (const quality of ARRIVAL_QUALITY_LADDER) {
      const image = await downscaleImageFile(file, { maxEdge, quality, mimeType: "image/jpeg" });
      if (image.dataUri.length <= ARRIVAL_PHOTO_TARGET_CHARS) return image;
    }
  }
  throw new Error("That photo is too detailed to compress — try a smaller one.");
}
