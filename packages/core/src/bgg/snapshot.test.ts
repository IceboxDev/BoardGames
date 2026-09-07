import { describe, expect, it } from "vitest";
import {
  applyCatalogOverrides,
  bggSnapshot,
  getBggByBggId,
  getBggBySlug,
  rawBggSnapshot,
} from "./snapshot";

describe("catalog bggOverrides", () => {
  it("are applied to the snapshot every consumer reads", () => {
    // catalog.json marks these party games as scaling to any headcount.
    for (const slug of ["codenames", "decrypto", "exploding-kittens", "wavelength"]) {
      expect(getBggBySlug(slug)?.maxPlayers, slug).toBe("infinity");
      expect(bggSnapshot[slug]?.maxPlayers, slug).toBe("infinity");
    }
  });

  it("are visible through the id lookup too", () => {
    const codenames = getBggBySlug("codenames");
    expect(codenames).not.toBeNull();
    expect(getBggByBggId(codenames?.id ?? -1)?.maxPlayers).toBe("infinity");
  });

  it("leave the raw snapshot untouched and every other field intact", () => {
    expect(typeof rawBggSnapshot.codenames?.maxPlayers).toBe("number");
    expect(getBggBySlug("codenames")?.minPlayers).toBe(rawBggSnapshot.codenames?.minPlayers);
    expect(getBggBySlug("codenames")?.name).toBe(rawBggSnapshot.codenames?.name);
  });

  it("merge shallowly and only where an override exists", () => {
    const raw = {
      a: { ...rawBggSnapshot.codenames, maxPlayers: 8 },
      b: { ...rawBggSnapshot.codenames, maxPlayers: 4 },
    } as typeof rawBggSnapshot;
    const merged = applyCatalogOverrides(raw, new Map([["a", { maxPlayers: "infinity" }]]));
    expect(merged.a?.maxPlayers).toBe("infinity");
    expect(merged.b?.maxPlayers).toBe(4);
    expect(merged.a?.name).toBe(raw.a?.name);
  });
});

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
