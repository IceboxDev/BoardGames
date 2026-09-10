// Data-URI ↔ bytes, shared by every image path (avatars, arrival photos).
//
// Lives apart from avatar-image.ts so callers that only need the codec do
// not pull the OpenAI SDK that file imports at module top.

export function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  if (comma === -1) throw new Error("malformed data URI");
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

/** Encoded webp bytes → the stored/served form. */
export function toWebpDataUri(webp: Buffer): string {
  return `data:image/webp;base64,${webp.toString("base64")}`;
}
