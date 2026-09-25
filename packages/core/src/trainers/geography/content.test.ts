import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptedNames } from "./grading.ts";
import { loadPlaces, realCatalog } from "./test-catalog.ts";

describe("geography content", () => {
  const places = loadPlaces();
  const catalog = realCatalog();

  it("holds seven continents and 197 countries, each with a continent and subregion", () => {
    expect(places.continents).toHaveLength(7);
    expect(places.countries).toHaveLength(197);
    for (const c of places.countries) {
      expect(catalog.continentByCode.has(c.continent), c.id).toBe(true);
      expect(catalog.subregionById.get(c.subregion)?.continent, c.id).toBe(c.continent);
    }
  });

  it("gives every country an outline in the globe data", () => {
    for (const file of ["world.lod.bin", "world-lite.lod.bin"]) {
      const ids = new Set(lodIds(readFileSync(new URL(`./content/${file}`, import.meta.url))));
      for (const c of places.countries) expect(ids.has(c.feature), `${file} ${c.id}`).toBe(true);
    }
  });

  it("gives every country but Nauru a capital among its cities", () => {
    for (const c of places.countries) {
      if (c.id === "co:NRU") continue;
      const capital = c.capital ? catalog.byId.get(c.capital) : undefined;
      expect(capital?.kind, c.id).toBe("city");
      expect(capital && capital.kind === "city" && capital.country, c.id).toBe(c.id);
    }
    expect(catalog.byId.get("co:DEU")?.kind).toBe("country");
    const berlin = catalog.citiesByCountry.get("co:DEU")?.[0];
    expect(berlin?.nameEn).toBe("Berlin");
    expect(berlin?.capital).toBe(true);
  });

  it("keeps ids unique and names present in both languages", () => {
    const ids = catalog.places.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of catalog.places) {
      expect(p.nameEn.trim(), p.id).not.toBe("");
      expect(p.nameDe.trim(), p.id).not.toBe("");
    }
  });

  it("names every country distinctly", () => {
    const seen = new Map<string, string>();
    for (const c of places.countries) {
      for (const n of acceptedNames(c)) {
        const prev = seen.get(n);
        expect(prev === undefined || prev === c.id, `${n}: ${prev} / ${c.id}`).toBe(true);
        seen.set(n, c.id);
      }
    }
  });
});

describe("continents on the globe", () => {
  const catalog = realCatalog();

  it("splits Russia at the Urals and counts Greenland for North America", async () => {
    const { continentsAt, continentParts } = await import("./catalog.ts");
    expect(continentsAt(catalog, "RUS", 37)).toEqual(["eu"]);
    expect(continentsAt(catalog, "RUS", 100)).toEqual(["as"]);
    expect(continentsAt(catalog, "RUS", -175)).toEqual(["as"]); // Chukotka
    expect(continentsAt(catalog, "EGY", 33.8)).toEqual(["as"]); // Sinai
    expect(continentsAt(catalog, "GEO", 44)).toEqual(["as", "eu"]);
    expect(continentsAt(catalog, "GRL", -40)).toEqual(["na"]);
    expect(continentsAt(catalog, "ATA", 0)).toEqual(["an"]);
    const europe = continentParts(catalog, "eu");
    expect(europe).toContainEqual({ feature: "RUS", clip: { lon: 60, side: "west" } });
    expect(europe.some((p) => p.feature === "DEU")).toBe(true);
    expect(continentParts(catalog, "an")).toEqual([{ feature: "ATA", clip: null }]);
  });
});

/** The feature ids at the head of a globe LOD file ("GLOD", version, ids). */
function lodIds(b: Uint8Array): string[] {
  let i = 5;
  const uvar = () => {
    let x = 0;
    let shift = 0;
    for (;;) {
      const byte = b[i++];
      x += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return x;
      shift += 7;
    }
  };
  const n = uvar();
  const ids: string[] = [];
  for (let k = 0; k < n; k++) {
    const len = uvar();
    ids.push(new TextDecoder().decode(b.subarray(i, i + len)));
    i += len;
  }
  return ids;
}
