import { describe, expect, it } from "vitest";
import {
  cityToleranceKm,
  editDistance,
  foldName,
  gradeOf,
  judgeLocate,
  judgeName,
} from "./grading.ts";
import { realCatalog } from "./test-catalog.ts";

const catalog = realCatalog();
const place = (id: string) => {
  const p = catalog.byId.get(id);
  if (!p) throw new Error(id);
  return p;
};
const cityNamed = (name: string) => {
  const c = catalog.cities.find((x) => x.nameEn === name);
  if (!c) throw new Error(name);
  return c;
};

describe("gradeOf", () => {
  const base = { hint: false, durationMs: 8000, direction: "locate" as const };
  it("maps outcomes to grades", () => {
    expect(gradeOf({ ...base, verdict: "wrong" })).toBe("again");
    expect(gradeOf({ ...base, verdict: "near" })).toBe("hard");
    expect(gradeOf({ ...base, verdict: "close" })).toBe("hard");
    expect(gradeOf({ ...base, verdict: "correct", hint: true, durationMs: 100 })).toBe("hard");
    expect(gradeOf({ ...base, verdict: "correct", typo: true, direction: "name" })).toBe("hard");
    expect(gradeOf({ ...base, verdict: "correct" })).toBe("good");
    expect(gradeOf({ ...base, verdict: "correct", durationMs: 3000 })).toBe("easy");
  });
});

describe("judgeLocate", () => {
  const click = { countryId: null, continents: [], insideTarget: false, distanceKm: 9999 };

  it("counts a continent by the land under the click, transcontinental both ways", () => {
    const europe = place("ct:eu");
    expect(judgeLocate(catalog, europe, { ...click, continents: ["eu"] }).verdict).toBe("correct");
    const wrong = judgeLocate(catalog, europe, { ...click, continents: ["af"] });
    expect(wrong).toEqual({ verdict: "wrong", confusedWith: "ct:af" });
    expect(judgeLocate(catalog, europe, click).verdict).toBe("wrong");
  });

  it("grades a country by its polygon, coast slack and near misses", () => {
    const de = place("co:DEU");
    expect(judgeLocate(catalog, de, { ...click, insideTarget: true }).verdict).toBe("correct");
    expect(judgeLocate(catalog, de, { ...click, distanceKm: 12 }).verdict).toBe("correct");
    const neighbour = { ...click, countryId: "co:AUT", distanceKm: 12 };
    expect(judgeLocate(catalog, de, neighbour).verdict).toBe("close");
    expect(judgeLocate(catalog, de, { ...neighbour, distanceKm: 100 }).verdict).toBe("near");
    expect(judgeLocate(catalog, de, { ...neighbour, distanceKm: 400 })).toEqual({
      verdict: "wrong",
      confusedWith: "co:AUT",
    });
  });

  it("treats a microstate as a point", () => {
    const va = place("co:VAT");
    expect(judgeLocate(catalog, va, { ...click, distanceKm: 40 }).verdict).toBe("correct");
    expect(judgeLocate(catalog, va, { ...click, distanceKm: 90 }).verdict).toBe("close");
    expect(judgeLocate(catalog, va, { ...click, distanceKm: 150 }).verdict).toBe("near");
    expect(judgeLocate(catalog, va, { ...click, distanceKm: 900 }).verdict).toBe("wrong");
  });

  it("scales a city's margin with its country", () => {
    expect(cityToleranceKm(356_000)).toBeCloseTo(59.7, 0);
    expect(cityToleranceKm(9_000_000)).toBe(100);
    expect(cityToleranceKm(2_000)).toBe(25);
    const munich = cityNamed("Munich");
    expect(judgeLocate(catalog, munich, { ...click, distanceKm: 50 }).verdict).toBe("correct");
    expect(judgeLocate(catalog, munich, { ...click, distanceKm: 90 }).verdict).toBe("close");
    expect(judgeLocate(catalog, munich, { ...click, distanceKm: 150 }).verdict).toBe("near");
    expect(judgeLocate(catalog, munich, { ...click, distanceKm: 400 }).verdict).toBe("wrong");
    // Clicking in another country is a miss, not a mix-up with that country…
    expect(
      judgeLocate(catalog, munich, { ...click, countryId: "co:CHE", distanceKm: 400 }),
    ).toEqual({
      verdict: "wrong",
      confusedWith: null,
    });
    // …but clicking right on another city is.
    const zurich = cityNamed("Zürich");
    expect(
      judgeLocate(catalog, munich, {
        ...click,
        countryId: "co:CHE",
        distanceKm: 250,
        cityId: zurich.id,
      }),
    ).toEqual({ verdict: "wrong", confusedWith: zurich.id });
  });
});

describe("judgeName", () => {
  it("folds case, accents, articles, umlauts and saints", () => {
    expect(foldName("  The Gambia ")).toBe("gambia");
    expect(foldName("St. Lucia")).toBe(foldName("Saint Lucia"));
    expect(foldName("Côte d’Ivoire")).toBe("cote divoire");
    expect(editDistance("slovakia", "slovaika")).toBe(1);
  });

  it("accepts either language and curated aliases", () => {
    const de = place("co:DEU");
    for (const typed of ["Germany", "deutschland", "DEUTSCHLAND"]) {
      expect(judgeName(catalog, de, typed)).toMatchObject({ verdict: "correct", typo: false });
    }
    expect(judgeName(catalog, place("co:AUT"), "Oesterreich").verdict).toBe("correct");
    expect(judgeName(catalog, place("co:CZE"), "Czech Republic").verdict).toBe("correct");
    expect(judgeName(catalog, place("co:USA"), "USA").verdict).toBe("correct");
    expect(judgeName(catalog, place("co:CIV"), "Ivory Coast").verdict).toBe("correct");
  });

  it("forgives a typo but shows it", () => {
    expect(judgeName(catalog, place("co:DEU"), "Germnay")).toEqual({
      verdict: "correct",
      typo: true,
      confusedWith: null,
    });
    expect(judgeName(catalog, place("co:KGZ"), "Kyrgystan").verdict).toBe("correct");
  });

  it("never accepts another place's exact name", () => {
    expect(judgeName(catalog, place("co:AUS"), "Austria")).toMatchObject({
      verdict: "wrong",
      confusedWith: "co:AUT",
    });
    expect(judgeName(catalog, place("co:NGA"), "Niger")).toMatchObject({
      verdict: "wrong",
      confusedWith: "co:NER",
    });
    expect(judgeName(catalog, place("co:SVK"), "Slovenia")).toMatchObject({
      verdict: "wrong",
      confusedWith: "co:SVN",
    });
    expect(judgeName(catalog, place("co:GNB"), "Guinea").verdict).toBe("wrong");
  });

  it("rejects far-off answers and blanks", () => {
    expect(judgeName(catalog, place("co:DEU"), "France").verdict).toBe("wrong");
    expect(judgeName(catalog, place("co:DEU"), "   ").verdict).toBe("wrong");
    expect(judgeName(catalog, place("co:DEU"), "xyz").verdict).toBe("wrong");
  });

  it("marks a country's name typed for its capital as a mix-up", () => {
    const mexicoCity = cityNamed("Mexico City");
    expect(judgeName(catalog, mexicoCity, "Mexiko-Stadt").verdict).toBe("correct");
    expect(judgeName(catalog, cityNamed("Brasília"), "Brazil")).toMatchObject({
      verdict: "wrong",
      confusedWith: "co:BRA",
    });
  });
});
