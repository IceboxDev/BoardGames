import { describe, expect, it } from "vitest";
import {
  CollectionResponseSchema,
  CreateAnnouncementBodySchema,
  ResolveAnnouncementBodySchema,
  SetPlayedThroughBodySchema,
  UpsertItemBodySchema,
} from "./collection.ts";

const item = {
  id: "ci-1",
  slug: "lost-cities",
  customTitle: null,
  boxId: null,
  sleeveStatus: "sleeved",
  sleeveTypeId: "st-1",
  statusId: null,
  widthMm: 200,
  depthMm: 50,
  heightMm: 300,
  weightG: 600,
  language: "EN",
  acquiredOn: "2025-12-24",
  pricePaidCents: 2499,
  note: "Birthday gift",
  playedThroughAt: null,
  updatedAt: "2026-08-15 10:00:00",
};

describe("CollectionResponseSchema", () => {
  it("parses a happy-path payload", () => {
    const parsed = CollectionResponseSchema.parse({
      ownerId: "u1",
      editable: true,
      slugs: ["lost-cities", "exit-abandoned-cabin", "deck-french-suited"],
      items: [item],
      boxes: [{ id: "b1", name: "Kallax shelf 3", note: null }],
      sleeveTypes: [{ id: "st-1", name: "Standard Euro", widthMm: 59, heightMm: 92, brand: null }],
      statuses: [{ id: "cs-1", label: "In rotation", sortOrder: 1 }],
      playStats: [{ slug: "lost-cities", playCount: 12, lastPlayedAt: "2026-08-01T20:00:00Z" }],
      announcements: [],
    });
    expect(parsed.items[0]?.sleeveStatus).toBe("sleeved");
  });

  it("tolerates a retired slug on a stored item (read leniency)", () => {
    expect(() =>
      CollectionResponseSchema.parse({
        ownerId: "u1",
        editable: false,
        slugs: [],
        items: [{ ...item, slug: "some-retired-game" }],
        boxes: [],
        sleeveTypes: [],
        statuses: [],
        playStats: [],
        announcements: [],
      }),
    ).not.toThrow();
  });
});

describe("UpsertItemBodySchema", () => {
  it("accepts a slug-targeted patch", () => {
    expect(() =>
      UpsertItemBodySchema.parse({ slug: "lost-cities", widthMm: 200, note: "hi" }),
    ).not.toThrow();
  });

  it("rejects both slug and itemId", () => {
    const r = UpsertItemBodySchema.safeParse({ slug: "lost-cities", itemId: "ci-1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["slug"]);
  });

  it("rejects neither slug nor itemId", () => {
    const r = UpsertItemBodySchema.safeParse({ note: "orphan" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["slug"]);
  });

  it("rejects the non-ownable exit anchor", () => {
    const r = UpsertItemBodySchema.safeParse({ slug: "exit" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["slug"]);
  });

  it("rejects a sleeve type on an unsleeved game", () => {
    const r = UpsertItemBodySchema.safeParse({
      slug: "lost-cities",
      sleeveStatus: "none",
      sleeveTypeId: "st-1",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["sleeveTypeId"]);
  });
});

describe("SetPlayedThroughBodySchema", () => {
  it("accepts an EXIT box and a Medical Mysteries one-shot", () => {
    expect(() =>
      SetPlayedThroughBodySchema.parse({ slug: "exit-abandoned-cabin", playedThrough: true }),
    ).not.toThrow();
    expect(() =>
      SetPlayedThroughBodySchema.parse({ slug: "medical-mysteries-nyc", playedThrough: false }),
    ).not.toThrow();
  });

  it("rejects a non-legacy game", () => {
    const r = SetPlayedThroughBodySchema.safeParse({ slug: "lost-cities", playedThrough: true });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["slug"]);
  });
});

describe("CreateAnnouncementBodySchema", () => {
  it("accepts a slug announcement", () => {
    expect(() => CreateAnnouncementBodySchema.parse({ slug: "lost-cities" })).not.toThrow();
  });

  it("accepts a free-text announcement", () => {
    expect(() =>
      CreateAnnouncementBodySchema.parse({ freeTextName: "Brass: Birmingham", note: "Deluxe" }),
    ).not.toThrow();
  });

  it("rejects neither field and both fields", () => {
    expect(CreateAnnouncementBodySchema.safeParse({}).success).toBe(false);
    expect(
      CreateAnnouncementBodySchema.safeParse({ slug: "lost-cities", freeTextName: "Lost Cities" })
        .success,
    ).toBe(false);
  });
});

describe("ResolveAnnouncementBodySchema", () => {
  it("requires a slug on approve but not on dismiss", () => {
    expect(() =>
      ResolveAnnouncementBodySchema.parse({ action: "approve", slug: "lost-cities" }),
    ).not.toThrow();
    expect(() => ResolveAnnouncementBodySchema.parse({ action: "dismiss" })).not.toThrow();
    expect(ResolveAnnouncementBodySchema.safeParse({ action: "approve" }).success).toBe(false);
  });
});
