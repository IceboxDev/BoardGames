import type {
  City,
  Continent,
  ContinentId,
  Country,
  Place,
  Places,
  Subregion,
  Territory,
} from "./content-types.ts";

// The deck's lookup tables and card ids: every place is learned through
// four stages, one card each (see STAGES).

export const DECK_ID = "geography";

/**
 * The four stages every place is learned through, easiest first:
 *   1  borders shown, its name given      → click it
 *   2  borders shown, it is highlighted   → type its name
 *   3  no borders, its name given         → click it
 *   4  no borders, a point inside it      → type its name
 * Each stage is one card, `<placeId>:s<stage>`.
 */
export const STAGES = [1, 2, 3, 4] as const;
export type Stage = (typeof STAGES)[number];

/** How a stage is answered: by clicking the globe, or by typing a name. */
export type AnswerMode = "locate" | "name";

export function modeOf(stage: Stage): AnswerMode {
  return stage === 1 || stage === 3 ? "locate" : "name";
}

/** Stages drawn with every border on the globe. */
export function bordered(stage: Stage): boolean {
  return stage <= 2;
}

export const PLACE_ID_RE = /^(ct:[a-z]{2}|co:[A-Z]{3}|ci:\d+)$/;
export const CARD_ID_RE = /^(ct:[a-z]{2}|co:[A-Z]{3}|ci:\d+):s([1-4])$/;

export function cardId(placeId: string, stage: Stage): string {
  return `${placeId}:s${stage}`;
}

export function parseCardId(id: string): { placeId: string; stage: Stage } | null {
  const m = CARD_ID_RE.exec(id);
  if (!m) return null;
  return { placeId: m[1], stage: Number(m[2]) as Stage };
}

export type Lang = "en" | "de";

export function placeName(place: Pick<Place, "nameEn" | "nameDe">, lang: Lang): string {
  return lang === "de" ? place.nameDe : place.nameEn;
}

export interface GeoCatalog {
  version: string;
  places: readonly Place[];
  continents: readonly Continent[];
  subregions: readonly Subregion[];
  countries: readonly Country[];
  cities: readonly City[];
  byId: ReadonlyMap<string, Place>;
  continentByCode: ReadonlyMap<ContinentId, Continent>;
  subregionById: ReadonlyMap<string, Subregion>;
  /** Countries of a subregion, introduction order. */
  countriesBySubregion: ReadonlyMap<string, readonly Country[]>;
  /** Subregions of a continent, introduction order. */
  subregionsByContinent: ReadonlyMap<ContinentId, readonly Subregion[]>;
  /** Cities of a country, capital first. */
  citiesByCountry: ReadonlyMap<string, readonly City[]>;
  /** TopoJSON feature id → quizzed country. */
  countryByFeature: ReadonlyMap<string, Country>;
  territoryByFeature: ReadonlyMap<string, Territory>;
  hasCard: (id: string) => boolean;
}

export function createCatalog(data: Places): GeoCatalog {
  const places: Place[] = [...data.continents, ...data.countries, ...data.cities];
  const byId = new Map(places.map((p) => [p.id, p]));
  const subregions = [...data.subregions].sort(
    (a, b) =>
      data.continents.findIndex((c) => c.code === a.continent) -
        data.continents.findIndex((c) => c.code === b.continent) || a.order - b.order,
  );
  const countriesBySubregion = new Map<string, Country[]>();
  for (const c of data.countries) {
    const list = countriesBySubregion.get(c.subregion) ?? [];
    list.push(c);
    countriesBySubregion.set(c.subregion, list);
  }
  for (const list of countriesBySubregion.values()) list.sort((a, b) => a.order - b.order);
  const subregionsByContinent = new Map<ContinentId, Subregion[]>();
  for (const s of subregions) {
    const list = subregionsByContinent.get(s.continent) ?? [];
    list.push(s);
    subregionsByContinent.set(s.continent, list);
  }
  const citiesByCountry = new Map<string, City[]>();
  for (const c of data.cities) {
    const list = citiesByCountry.get(c.country) ?? [];
    list.push(c);
    citiesByCountry.set(c.country, list);
  }
  for (const list of citiesByCountry.values()) list.sort((a, b) => a.order - b.order);
  return {
    version: data.version,
    places,
    continents: data.continents,
    subregions,
    countries: data.countries,
    cities: data.cities,
    byId,
    continentByCode: new Map(data.continents.map((c) => [c.code, c])),
    subregionById: new Map(subregions.map((s) => [s.id, s])),
    countriesBySubregion,
    subregionsByContinent,
    citiesByCountry,
    countryByFeature: new Map(data.countries.map((c) => [c.feature, c])),
    territoryByFeature: new Map(data.territories.map((t) => [t.feature, t])),
    hasCard: (id) => {
      const parsed = parseCardId(id);
      return parsed !== null && byId.has(parsed.placeId);
    },
  };
}

/** The continent a place belongs to (a city: its country's). */
export function continentOf(catalog: GeoCatalog, place: Place): ContinentId {
  if (place.kind === "continent") return place.code;
  if (place.kind === "country") return place.continent;
  const country = catalog.byId.get(place.country);
  return country?.kind === "country" ? country.continent : "eu";
}

/** The country a place belongs to, if any. */
export function countryOf(catalog: GeoCatalog, place: Place): Country | null {
  if (place.kind === "country") return place;
  if (place.kind === "city") {
    const c = catalog.byId.get(place.country);
    return c?.kind === "country" ? c : null;
  }
  return null;
}

/** Where the globe looks to show a place. */
export function focusOf(place: Place): [number, number] {
  return place.kind === "city" ? place.at : place.focus;
}

/**
 * The continents a click on a feature counts for. A split country answers
 * by the side of its meridian the click is on; a transcontinental one
 * (Georgia, Cyprus, …) counts for all of its continents; a territory for
 * its own (Greenland → North America, Antarctica).
 */
export function continentsAt(catalog: GeoCatalog, featureId: string, lon: number): ContinentId[] {
  const country = catalog.countryByFeature.get(featureId);
  if (country) {
    if (country.split) {
      // West = the half-globe up to 180° west of the meridian (Chukotka, at
      // −170°, is east of the Urals, not west).
      const d = ((((lon - country.split.lon) % 360) + 540) % 360) - 180;
      return [d < 0 ? country.split.west : country.split.east];
    }
    return [country.continent, ...country.alsoContinents];
  }
  const territory = catalog.territoryByFeature.get(featureId);
  return territory?.continent ? [territory.continent] : [];
}

/** A feature drawn as part of a continent, clipped to one side of a meridian if split. */
export interface ContinentPart {
  feature: string;
  clip: { lon: number; side: "west" | "east" } | null;
}

/** Everything a continent is made of on the globe: its countries (and halves) and territories. */
export function continentParts(catalog: GeoCatalog, code: ContinentId): ContinentPart[] {
  const out: ContinentPart[] = [];
  for (const c of catalog.countries) {
    if (c.split) {
      if (c.split.west === code)
        out.push({ feature: c.feature, clip: { lon: c.split.lon, side: "west" } });
      if (c.split.east === code)
        out.push({ feature: c.feature, clip: { lon: c.split.lon, side: "east" } });
    } else if (c.continent === code) out.push({ feature: c.feature, clip: null });
  }
  for (const t of catalog.territoryByFeature.values()) {
    if (t.continent === code) out.push({ feature: t.feature, clip: null });
  }
  return out;
}
