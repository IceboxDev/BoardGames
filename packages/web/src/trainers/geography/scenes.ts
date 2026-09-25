import {
  continentOf,
  continentParts,
  countryOf,
  focusOf,
  type GeoCatalog,
  type Lang,
  placeName,
} from "@boardgames/core/trainers/geography/catalog";
import type { ContinentId, Place } from "@boardgames/core/trainers/geography/content-types";
import type { GlobeFill, GlobeFocus, GlobeMarker, GlobeScene } from "./globe/Globe";
import type { LonLat } from "./globe/geo";
import type { Tone } from "./globe/palette";

// How a place looks on the globe: a continent is its countries (Russia and
// friends clipped at their meridian) and territories, a country its own
// shape (a microstate also gets a ring, it would be invisible otherwise),
// a city a dot with its country outlined for context.

const EARTH_KM = 6371;

/** Frames each continent whole, from Europe (small, close) to Asia (half a hemisphere). */
const CONTINENT_ZOOM: Record<ContinentId, number> = {
  eu: 2.1,
  as: 1.05,
  af: 1.3,
  na: 1.25,
  sa: 1.45,
  oc: 1.55,
  an: 1.35,
};

export function placeFills(
  catalog: GeoCatalog,
  place: Place,
  tone: Tone,
  alpha = 0.85,
): GlobeFill[] {
  if (place.kind === "continent") {
    return continentParts(catalog, place.code).map((p) => ({ ...p, tone, alpha }));
  }
  if (place.kind === "country") return [{ feature: place.feature, tone, alpha }];
  return [];
}

export function placeMarkers(
  place: Place,
  tone: Tone,
  opts: { label?: string; pulse?: boolean } = {},
): GlobeMarker[] {
  if (place.kind === "city") {
    return [{ at: place.at, tone, size: 5, pulse: opts.pulse, label: opts.label }];
  }
  if (place.kind === "country" && place.tiny) {
    return [{ at: place.focus, tone, size: 9, ring: true, pulse: opts.pulse, label: opts.label }];
  }
  return opts.label ? [{ at: focusOf(place), tone, size: 0, label: opts.label }] : [];
}

/**
 * The place's own outline (a country; a continent reads from its fill — and
 * outlining all of Russia would misstate Europe). The borderless stages
 * show this instead of every border.
 */
export function placeOutlines(
  _catalog: GeoCatalog,
  place: Place,
  tone: Tone,
): NonNullable<GlobeScene["outlines"]> {
  return place.kind === "country" ? [{ feature: place.feature, tone, width: 1.6 }] : [];
}

/** The place's country outlined (a city's context). */
export function contextOutline(catalog: GeoCatalog, place: Place): GlobeScene["outlines"] {
  const country = place.kind === "city" ? countryOf(catalog, place) : null;
  return country ? [{ feature: country.feature, tone: "strong", width: 1.2 }] : [];
}

/** A camera that frames the place: the smaller it is, the closer. */
export function placeFocus(catalog: GeoCatalog, place: Place, key: string | number): GlobeFocus {
  if (place.kind === "continent") {
    return { at: place.focus, zoom: CONTINENT_ZOOM[place.code], key };
  }
  const country = countryOf(catalog, place);
  const area = country?.areaKm2 ?? 100_000;
  const rKm = Math.sqrt(Math.max(area, 400) / Math.PI);
  const base = EARTH_KM / (3 * rKm);
  const zoom = Math.min(
    place.kind === "city" ? 16 : 12,
    Math.max(1, base * (place.kind === "city" ? 1.2 : 1)),
  );
  return { at: focusOf(place), zoom, key };
}

/** A continent-scale camera around a place (the "zoom to region" hint). */
export function regionFocus(catalog: GeoCatalog, place: Place, key: string | number): GlobeFocus {
  if (place.kind === "city") {
    const country = countryOf(catalog, place);
    if (country) return placeFocus(catalog, country, key);
  }
  const code = continentOf(catalog, place);
  const continent = catalog.continentByCode.get(code);
  return { at: continent?.focus ?? focusOf(place), zoom: 1.6, key };
}

/**
 * What kind of place a prompt asks for — and nothing more: no country for a
 * city, no "capital" (that would narrow the answer down; the hints do that,
 * at a price).
 */
export function promptKind(place: Place, lang: Lang): string {
  if (place.kind === "continent") return lang === "de" ? "Kontinent" : "Continent";
  if (place.kind === "country") return lang === "de" ? "Staat" : "Country";
  return lang === "de" ? "Stadt" : "City";
}

/** "Country", "Capital · Germany", "Continent" — for after the answer (and Explore). */
export function kindLabel(catalog: GeoCatalog, place: Place, lang: Lang): string {
  if (place.kind === "continent") return lang === "de" ? "Kontinent" : "Continent";
  if (place.kind === "country") return lang === "de" ? "Staat" : "Country";
  const country = countryOf(catalog, place);
  const cname = country ? placeName(country, lang) : "";
  if (place.capital) return lang === "de" ? `Hauptstadt · ${cname}` : `Capital · ${cname}`;
  return lang === "de" ? `Stadt · ${cname}` : `City · ${cname}`;
}

/** Where the target sits, for an arc from a missed pin. */
export function targetPoint(place: Place): LonLat {
  return focusOf(place);
}
