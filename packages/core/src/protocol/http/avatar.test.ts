import { describe, expect, it } from "vitest";
import { GenerateAvatarRequestSchema, SaveAvatarRequestSchema } from "./avatar.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const WEBP = "data:image/webp;base64,UklGRh4=";

describe("GenerateAvatarRequestSchema", () => {
  it("accepts a valid request", () => {
    const r = GenerateAvatarRequestSchema.safeParse({
      referenceImage: PNG,
      gameSlug: "lost-cities",
      styleId: "standard",
      comments: "make it cheerful",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null comments", () => {
    const r = GenerateAvatarRequestSchema.safeParse({
      referenceImage: PNG,
      gameSlug: "lost-cities",
      styleId: "standard",
      comments: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-image reference", () => {
    const r = GenerateAvatarRequestSchema.safeParse({
      referenceImage: "data:text/plain;base64,aGk=",
      gameSlug: "lost-cities",
      styleId: "standard",
      comments: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["referenceImage"]);
  });

  it("rejects an unknown style", () => {
    const r = GenerateAvatarRequestSchema.safeParse({
      referenceImage: PNG,
      gameSlug: "lost-cities",
      styleId: "fancy",
      comments: null,
    });
    expect(r.success).toBe(false);
  });
});

describe("SaveAvatarRequestSchema", () => {
  it("accepts a webp data URI", () => {
    expect(SaveAvatarRequestSchema.safeParse({ image: WEBP }).success).toBe(true);
  });

  it("rejects a non-webp data URI", () => {
    expect(SaveAvatarRequestSchema.safeParse({ image: PNG }).success).toBe(false);
  });
});
