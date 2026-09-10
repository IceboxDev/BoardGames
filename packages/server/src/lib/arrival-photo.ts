// The arrival photo pipeline: whatever the admin uploads → one bounded
// 4:5 webp plus a tiny blurred placeholder.
//
// The portrait crop is BAKED here, centred, so the crop the composer
// previews with CSS `object-cover` is byte-for-byte the crop members see,
// and the placeholder is a true miniature of it. `rotate()` honours EXIF
// orientation before the crop; sharp strips the metadata on output, so a
// phone's GPS tag never reaches the database.

import sharp from "sharp";
import { dataUriToBuffer, toWebpDataUri } from "./data-uri.ts";

export const ARRIVAL_PHOTO_WIDTH = 1280;
export const ARRIVAL_PHOTO_HEIGHT = 1600;
export const ARRIVAL_PHOTO_QUALITY = 82;
/** Second attempt when the first encode is over budget (busy photos). */
const FALLBACK_QUALITY = 65;
/** Encoded webp bytes. The data URI stored is ~4/3 of this. */
export const ARRIVAL_PHOTO_MAX_BYTES = 700_000;
export const ARRIVAL_PLACEHOLDER_WIDTH = 24;
export const ARRIVAL_PLACEHOLDER_HEIGHT = 30;
/** Refuse decode bombs before sharp allocates for them. */
const MAX_INPUT_PIXELS = 50_000_000;

export type ArrivalPhotoErrorCode = "NOT_AN_IMAGE" | "PHOTO_TOO_LARGE";

export class ArrivalPhotoError extends Error {
  readonly code: ArrivalPhotoErrorCode;
  constructor(code: ArrivalPhotoErrorCode, message: string) {
    super(message);
    this.name = "ArrivalPhotoError";
    this.code = code;
  }
}

export type ProcessedArrivalPhoto = {
  /** `data:image/webp;base64,…`, exactly ARRIVAL_PHOTO_WIDTH × HEIGHT. */
  photo: string;
  /** `data:image/webp;base64,…`, ARRIVAL_PLACEHOLDER_WIDTH × HEIGHT. */
  placeholder: string;
  width: number;
  height: number;
  /** Encoded bytes of `photo`. */
  bytes: number;
};

export async function processArrivalPhoto(
  dataUri: string,
  options: { readonly maxBytes?: number } = {},
): Promise<ProcessedArrivalPhoto> {
  const maxBytes = options.maxBytes ?? ARRIVAL_PHOTO_MAX_BYTES;
  let input: Buffer;
  try {
    input = dataUriToBuffer(dataUri);
  } catch {
    throw new ArrivalPhotoError("NOT_AN_IMAGE", "That upload is not an image we can read.");
  }

  const cropped = () =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(ARRIVAL_PHOTO_WIDTH, ARRIVAL_PHOTO_HEIGHT, { fit: "cover", position: "centre" });

  let encoded: { data: Buffer; info: sharp.OutputInfo };
  try {
    encoded = await cropped()
      .webp({ quality: ARRIVAL_PHOTO_QUALITY })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ArrivalPhotoError("NOT_AN_IMAGE", "That upload is not an image we can read.");
  }
  if (encoded.info.size > maxBytes) {
    encoded = await cropped()
      .webp({ quality: FALLBACK_QUALITY })
      .toBuffer({ resolveWithObject: true });
    if (encoded.info.size > maxBytes) {
      throw new ArrivalPhotoError(
        "PHOTO_TOO_LARGE",
        "That photo is too detailed to compress — try a simpler shot.",
      );
    }
  }

  const placeholder = await sharp(encoded.data)
    .resize(ARRIVAL_PLACEHOLDER_WIDTH, ARRIVAL_PLACEHOLDER_HEIGHT, { fit: "cover" })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    photo: toWebpDataUri(encoded.data),
    placeholder: toWebpDataUri(placeholder),
    width: encoded.info.width,
    height: encoded.info.height,
    bytes: encoded.info.size,
  };
}
