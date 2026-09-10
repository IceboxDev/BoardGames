import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ARRIVAL_PHOTO_HEIGHT,
  ARRIVAL_PHOTO_MAX_BYTES,
  ARRIVAL_PHOTO_WIDTH,
  ARRIVAL_PLACEHOLDER_HEIGHT,
  ARRIVAL_PLACEHOLDER_WIDTH,
  ArrivalPhotoError,
  processArrivalPhoto,
} from "./arrival-photo.ts";
import { dataUriToBuffer } from "./data-uri.ts";

const RED = { r: 220, g: 30, b: 30 };
const BLUE = { r: 30, g: 30, b: 220 };

/** A `width`×`height` image whose left half is red and right half blue. */
async function halves(width: number, height: number): Promise<sharp.Sharp> {
  const blue = await sharp({
    create: { width: Math.floor(width / 2), height, channels: 3, background: BLUE },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 3, background: RED } }).composite([
    { input: blue, left: Math.floor(width / 2), top: 0 },
  ]);
}

function toDataUri(mime: string, buf: Buffer): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function pixel(
  webp: Buffer,
  x: number,
  y: number,
): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 };
}

const isRed = (p: { r: number; b: number }) => p.r > 150 && p.b < 100;
const isBlue = (p: { r: number; b: number }) => p.b > 150 && p.r < 100;

describe("processArrivalPhoto", () => {
  it("bakes a centred 4:5 crop as a bounded webp with a miniature placeholder", async () => {
    const png = await (await halves(3000, 2000)).png().toBuffer();
    const out = await processArrivalPhoto(toDataUri("image/png", png));

    expect(out.width).toBe(ARRIVAL_PHOTO_WIDTH);
    expect(out.height).toBe(ARRIVAL_PHOTO_HEIGHT);
    expect(out.photo.startsWith("data:image/webp;base64,")).toBe(true);
    expect(out.bytes).toBeLessThanOrEqual(ARRIVAL_PHOTO_MAX_BYTES);
    expect(dataUriToBuffer(out.photo).byteLength).toBe(out.bytes);

    // Landscape source, centre crop: the seam stays in the middle.
    const photo = dataUriToBuffer(out.photo);
    expect(isRed(await pixel(photo, 200, 800))).toBe(true);
    expect(isBlue(await pixel(photo, 1080, 800))).toBe(true);

    const placeholder = await sharp(dataUriToBuffer(out.placeholder)).metadata();
    expect(placeholder.width).toBe(ARRIVAL_PLACEHOLDER_WIDTH);
    expect(placeholder.height).toBe(ARRIVAL_PLACEHOLDER_HEIGHT);
    expect(out.placeholder.length).toBeLessThan(4_000);
  });

  it("honours EXIF orientation before cropping", async () => {
    // Orientation 6 = "rotate 90° clockwise to display": the stored left
    // half (red) must end up on TOP.
    const jpeg = await (await halves(3000, 2000))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await processArrivalPhoto(toDataUri("image/jpeg", jpeg));
    const photo = dataUriToBuffer(out.photo);
    expect(isRed(await pixel(photo, 640, 200))).toBe(true);
    expect(isBlue(await pixel(photo, 640, 1400))).toBe(true);
  });

  it("scales a small image up to the fixed frame", async () => {
    const png = await (await halves(100, 80)).png().toBuffer();
    const out = await processArrivalPhoto(toDataUri("image/png", png));
    expect([out.width, out.height]).toEqual([ARRIVAL_PHOTO_WIDTH, ARRIVAL_PHOTO_HEIGHT]);
  });

  it("rejects bytes that are not an image", async () => {
    const garbage = toDataUri("image/png", Buffer.from("definitely not a png"));
    await expect(processArrivalPhoto(garbage)).rejects.toMatchObject({
      name: "ArrivalPhotoError",
      code: "NOT_AN_IMAGE",
    });
    await expect(processArrivalPhoto("no-comma-here")).rejects.toBeInstanceOf(ArrivalPhotoError);
  });

  it("gives up when even the fallback quality is over budget", async () => {
    const png = await (await halves(400, 500)).png().toBuffer();
    await expect(
      processArrivalPhoto(toDataUri("image/png", png), { maxBytes: 64 }),
    ).rejects.toMatchObject({ code: "PHOTO_TOO_LARGE" });
  });
});
