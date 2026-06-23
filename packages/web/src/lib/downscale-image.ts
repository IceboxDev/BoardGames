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
