// Downscale a user-picked image file to a small data URI before uploading it as
// an avatar-generation reference. Keeps the request small (phone photos can be
// 5–12 MB) and bakes in EXIF orientation so sideways selfies upload upright.
// The server downscales again before sending to the image model.

export async function fileToDownscaledDataUri(
  file: File,
  maxEdge = 1024,
  quality = 0.9,
): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);

    // webp where supported; browsers that don't support it fall back to png,
    // both of which the server + protocol accept.
    return canvas.toDataURL("image/webp", quality);
  } finally {
    bitmap.close();
  }
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
