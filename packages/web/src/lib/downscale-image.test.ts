import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ARRIVAL_PHOTO_TARGET_CHARS,
  dataUriBytes,
  downscaleImageFile,
  fileToArrivalPhoto,
  fitWithin,
} from "./downscale-image";

// jsdom has no canvas encoder and no `createImageBitmap`, so the pixel work is
// stubbed: the canvas records the size it was asked for and hands back a data
// URI whose length the test controls. What is pinned is the geometry, the
// bookkeeping and the size ladder — the parts that decide what the server
// receives.

describe("fitWithin", () => {
  it("shrinks the longer edge to the cap and keeps the ratio", () => {
    expect(fitWithin(3000, 2000, 2000)).toEqual({ width: 2000, height: 1333 });
    expect(fitWithin(2000, 3000, 2000)).toEqual({ width: 1333, height: 2000 });
  });

  it("never enlarges and never returns a zero edge", () => {
    expect(fitWithin(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(4000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe("dataUriBytes", () => {
  it("decodes the base64 payload length, minus padding", () => {
    expect(dataUriBytes("data:image/jpeg;base64,aGVsbG8=")).toBe(5); // "hello"
    expect(dataUriBytes("data:image/jpeg;base64,aGk=")).toBe(2); // "hi"
    expect(dataUriBytes("data:image/jpeg;base64,YWJj")).toBe(3); // "abc"
    expect(dataUriBytes("nonsense")).toBe(0);
  });
});

type CanvasCall = { width: number; height: number; mime: string; quality: number | undefined };

let calls: CanvasCall[];
/** What `toDataURL` returns for the next encode(s); tests push ladders. */
let outputs: string[];
let bitmapSize: { width: number; height: number };

beforeEach(() => {
  calls = [];
  outputs = [];
  bitmapSize = { width: 3000, height: 2000 };
  vi.stubGlobal("createImageBitmap", async () => ({
    width: bitmapSize.width,
    height: bitmapSize.height,
    close: () => {},
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: () => {} }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
    this: HTMLCanvasElement,
    mime?: string,
    quality?: number,
  ) {
    calls.push({ width: this.width, height: this.height, mime: mime ?? "", quality });
    return outputs.shift() ?? "data:image/jpeg;base64,YWJj";
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const jpeg = () => new File(["x"], "box.jpg", { type: "image/jpeg" });

describe("downscaleImageFile", () => {
  it("draws at the fitted size and reports the encoded bytes", async () => {
    outputs.push("data:image/jpeg;base64,aGVsbG8=");
    const out = await downscaleImageFile(jpeg(), { maxEdge: 1500, quality: 0.8 });
    // webp is the default encoder (the avatar reference path); arrivals ask for jpeg.
    expect(calls).toEqual([{ width: 1500, height: 1000, mime: "image/webp", quality: 0.8 }]);
    expect(out).toEqual({
      dataUri: "data:image/jpeg;base64,aGVsbG8=",
      width: 1500,
      height: 1000,
      bytes: 5,
    });
  });

  it("falls back to an <img> decode when createImageBitmap is missing", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:x",
      revokeObjectURL: () => {},
    });
    // jsdom's <img> has no decode() and never loads; give it both.
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: () => Promise.resolve(),
    });
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1000);
    try {
      const out = await downscaleImageFile(jpeg(), { maxEdge: 2000 });
      expect(out.width).toBe(800);
      expect(out.height).toBe(1000);
    } finally {
      Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
    }
  });
});

describe("fileToArrivalPhoto", () => {
  it("rejects a non-image up front", async () => {
    await expect(
      fileToArrivalPhoto(new File(["x"], "notes.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Choose a PNG, JPEG or WebP photo.");
    expect(calls).toHaveLength(0);
  });

  it("returns the first encode that fits, at 2000px and quality 0.9", async () => {
    outputs.push("data:image/jpeg;base64,YWJj");
    const out = await fileToArrivalPhoto(jpeg());
    expect(calls).toEqual([{ width: 2000, height: 1333, mime: "image/jpeg", quality: 0.9 }]);
    expect(out.width).toBe(2000);
  });

  it("walks quality down, then the edge down, until the data URI fits the target", async () => {
    const big = `data:image/jpeg;base64,${"A".repeat(ARRIVAL_PHOTO_TARGET_CHARS)}`;
    outputs.push(big, big, big, big, "data:image/jpeg;base64,YWJj");
    const out = await fileToArrivalPhoto(jpeg());
    expect(calls.map((c) => [c.width, c.quality])).toEqual([
      [2000, 0.9],
      [2000, 0.8],
      [2000, 0.7],
      [1600, 0.9],
      [1600, 0.8],
    ]);
    expect(out.width).toBe(1600);
  });

  it("gives up with a user-facing message when nothing fits", async () => {
    const big = `data:image/jpeg;base64,${"A".repeat(ARRIVAL_PHOTO_TARGET_CHARS)}`;
    outputs.push(big, big, big, big, big, big);
    await expect(fileToArrivalPhoto(jpeg())).rejects.toThrow(/too detailed to compress/);
    expect(calls).toHaveLength(6);
  });
});
