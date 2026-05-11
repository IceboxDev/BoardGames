import { describe, expect, it } from "vitest";
import { bggSnapshot, getBggByBggId, getBggBySlug } from "./snapshot";

describe("bggSnapshot", () => {
  it("contains at least one entry", () => {
    expect(Object.keys(bggSnapshot).length).toBeGreaterThan(0);
  });

  it("every entry has the required shape", () => {
    for (const [slug, entry] of Object.entries(bggSnapshot)) {
      expect(typeof entry.id, slug).toBe("number");
      expect(entry.id, slug).toBeGreaterThanOrEqual(0);
      expect(typeof entry.name, slug).toBe("string");
      expect(entry.name.length, slug).toBeGreaterThan(0);
      expect(typeof entry.description, slug).toBe("string");
      expect(Array.isArray(entry.categories), slug).toBe(true);
      expect(Array.isArray(entry.mechanics), slug).toBe(true);
      expect(Array.isArray(entry.designers), slug).toBe(true);
      expect(Array.isArray(entry.artists), slug).toBe(true);
      expect(Array.isArray(entry.publishers), slug).toBe(true);
    }
  });

  it("BGG ids are unique across slugs (excluding the 0 sentinel)", () => {
    const ids = Object.values(bggSnapshot)
      .map((e) => e.id)
      .filter((id) => id !== 0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getBggBySlug", () => {
  it("returns null for unknown slug", () => {
    expect(getBggBySlug("definitely-not-a-real-slug")).toBeNull();
  });

  it("returns the entry for a known slug", () => {
    const [firstSlug] = Object.keys(bggSnapshot);
    const entry = getBggBySlug(firstSlug);
    expect(entry).not.toBeNull();
    expect(entry?.id).toBe(bggSnapshot[firstSlug].id);
  });
});

describe("getBggByBggId", () => {
  it("returns null for unknown id", () => {
    expect(getBggByBggId(-1)).toBeNull();
  });

  it("returns the entry for a known id", () => {
    const [firstSlug, firstEntry] = Object.entries(bggSnapshot)[0];
    const found = getBggByBggId(firstEntry.id);
    expect(found?.id).toBe(firstEntry.id);
    expect(found?.name).toBe(bggSnapshot[firstSlug].name);
  });
});
